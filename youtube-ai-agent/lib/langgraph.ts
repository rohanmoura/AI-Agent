import { ChatGroq } from "@langchain/groq"
import { ToolNode } from "@langchain/langgraph/prebuilt";
import wxflows from "@wxflows/sdk/langchain";
import { StateGraph, START, END, MessagesAnnotation, MemorySaver } from "@langchain/langgraph";
import { AIMessage, BaseMessage, SystemMessage, trimMessages } from "@langchain/core/messages";
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from "@langchain/core/prompts";
import SYSTEM_MESSAGE from "@/constants/systemMessage";

// Customers at: https://introspection.apis.stepzen.com/customers
// Comments at: https://dummyjson.com/comments

// Trim the messages to manage converstaion history 
const trimmer = trimMessages({
    maxTokens: 10,
    strategy: "last",
    tokenCounter: (msgs) => msgs.length,
    includeSystem: true,
    allowPartial: false,
    startOn: "human",
})

// Connect to wxflows 
const toolClient = new wxflows({
    endpoint: process.env.WXFLOWS_ENDPOINT || "",
    apikey: process.env.WXFLOWS_APIKEY,
})

// Retrieve the tools 
const tools = await toolClient.lcTools;
const toolNode = new ToolNode(tools);

const initialiseModel = () => {
    const model = new ChatGroq({
        modelName: "mixtral-8x7b-32768",
        apiKey: process.env.GROQ_API_KEY,
        temperature: 0.7, // Higer tempreature = more random, lower = more predictable
        maxTokens: 4096, // Higher max tokens = more tokens generated, lower = less tokens generated
        streaming: true, // Enable streaming for SSE
        callbacks: [
            {
                handleLLMStart: async () => {
                    // console.log("LLM started");
                },
                handleLLMEnd: async (output) => {
                    // console.log("LLM ended", output);
                    const usage = output.llmOutput?.usage;
                    if (usage) {
                        // console.log("Tokens used: ", {
                        //     input_tokens: usage.input_tokens,
                        //     output_tokens: usage.output_tokens,
                        //     total_tokens: usage.input_tokens + usage.output_tokens,
                        //     cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
                        //     cache_read_input_tokens: usage.cache_read_input_tokens || 0,
                        // })
                    }
                },
                handleLLMNewToken: async (token: string) => {
                    console.log("New token: ", token);
                }
            }
        ]
    }).bindTools(tools);

    return model;
}

// Define the function that determines whether to continue or not 
function shouldContinue(state: typeof MessagesAnnotation.State) {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1] as AIMessage;

    // if the llm makes a tool call, then we route to the "tools" node
    if (lastMessage.tool_calls?.length) {
        return "tools";
    }
    // if the last message is not a tool call, then we route to the "agent" node
    if (lastMessage.content && lastMessage._getType() === "tool") {
        return "agent";
    }

    // Otherwise, we stop (reply to the user)
    return END;
}

const createWorkflow = () => {
    const model = initialiseModel();
    const stateGraph = new StateGraph(MessagesAnnotation).addNode(
        "agent",
        async (state) => {
            // Create the Syatem message content
            const systemContent = SYSTEM_MESSAGE;

            // Create the prompt template with system message and messages placeholder
            const promptTemplate = ChatPromptTemplate.fromMessages([
                new SystemMessage(systemContent, {
                    cache_control: { type: "ephemeral" }, // Set a cache breakpoint (max number of breakpoint is 4)
                }),
                new MessagesPlaceholder("messages"),
            ]);

            // Trim the messages to manage conversation history
            const trimmedMessages = await trimmer.invoke(state.messages);

            // Format the prompt with the current messages 
            const prompt = await promptTemplate.invoke({
                messages: trimmedMessages,
            });

            // Get response from the model
            const response = await model.invoke(prompt);

            return { messages: [response] };
        }
    )
        .addEdge(START, "agent")
        .addNode("tools", toolNode)
        .addConditionalEdges("agent", shouldContinue)
        .addEdge("tools", "agent");

    return stateGraph;
}


export async function submitQuestion(messages: BaseMessage[], chatId: string) {
    const workflow = createWorkflow();

    // create a check point to save the state of the conversation
    const checkpointer = new MemorySaver();
    const app = workflow.compile({ checkpointer });

    // Run the graph and stream 
    const stream = await app.streamEvents(
        {
            messages,
        },
        {
            version: "v2",
            configurable: {
                thread_id: chatId,
            },
            streamMode: "messages",
            runId: chatId,
        }
    );

    return stream;
}