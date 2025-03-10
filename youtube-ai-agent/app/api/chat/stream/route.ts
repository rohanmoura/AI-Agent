import { api } from "@/convex/_generated/api";
import getConvexClient from "@/lib/convex";
import { submitQuestion } from "@/lib/langgraph";
import { ChatRequestBody, SSE_DATA_PREFIX, SSE_LINE_DELIMITER, StreamMessage, StreamMessageType } from "@/lib/types";
import { auth } from "@clerk/nextjs/server";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { NextResponse } from "next/server";

function SendSSEMessage(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    data: StreamMessage
) {
    const encoder = new TextEncoder();
    return writer.write(
        encoder.encode(
            `${SSE_DATA_PREFIX}${JSON.stringify(data)}${SSE_LINE_DELIMITER}`
        )
    )
}

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return new Response("Unauthorized", { status: 401 });
        }
        const body = (await req.json()) as ChatRequestBody;
        const { messages, newMessage, chatId } = body;
        const convex = getConvexClient();

        // create stream with larger queue strategy for better perfomance
        const stream = new TransformStream({}, { highWaterMark: 1024 });
        const writer = stream.writable.getWriter();

        const response = new Response(stream.readable, {
            headers: {
                "Content-Type": "text/event-stream",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no", // disable Nginx buffering
            },
        });

        const startStream = async () => {
            try {
                // Stream will be implemented here

                // Send initial connection established message 
                await SendSSEMessage(writer, { type: StreamMessageType.Connected });

                // Send user message to Convex
                await convex.mutation(api.messages.send, {
                    chatId,
                    content: newMessage,
                });

                // Convert messages to langchain format
                const langChainMessages = [
                    ...messages.map((msg) =>
                        msg.role === "user"
                            ? new HumanMessage(msg.content)
                            : new AIMessage(msg.content)
                    ),
                    new HumanMessage(newMessage),
                ];

                try {
                    // Create the event stream
                    const eventStream = await submitQuestion(langChainMessages, chatId);

                    // process the events
                    for await (const event of eventStream) {
                        // console.log ("Event: ", event);

                        if (event.event === "on_chat_model_stream") {
                            const token = event.data.chunk;
                            if (token) {
                                // Access the text property fron the AIMessageChunk
                                const text = token.content.at(0)?.["text"];

                                if (text) {
                                    await SendSSEMessage(writer, {
                                        type: StreamMessageType.Token,
                                        token: text,
                                    });
                                }
                            }
                        } else if (event.event === "on_tool_start") {
                            await SendSSEMessage(writer, {
                                type: StreamMessageType.ToolStart,
                                tool: event.name || "unknown",
                                input: event.data.input,
                            });
                        } else if (event.event === "on_tool_end") {
                            const toolMessage = new ToolMessage(event.data.output);

                            await SendSSEMessage(writer, {
                                type: StreamMessageType.ToolEnd,
                                tool: toolMessage.lc_kwargs.name || "unknown",
                                output: event.data.output,
                            });
                        }

                        // Send completion message without storing the response
                        await SendSSEMessage(writer, { type: StreamMessageType.Done });
                    }
                } catch (streamError) {
                    console.log("Error in event stream: ", streamError);
                    await SendSSEMessage(writer, {
                        type: StreamMessageType.Error,
                        error:
                            streamError instanceof
                                Error
                                ? streamError.message
                                : "Stream processing failed"
                    });
                }

            } catch (error) {
                console.error("Error in stream", error);
                await SendSSEMessage(writer, {
                    type: StreamMessageType.Error,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            } finally {
                try {
                    await writer.close();
                } catch (closeError) {
                    console.log("Error closing writer: ", closeError);
                }
            }
        };

        startStream();

        return response;
    } catch (error) {
        console.error("Error in POST request:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
}