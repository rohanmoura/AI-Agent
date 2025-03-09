import { ChatGroq } from "@langchain/groq"
import { ToolNode } from "@langchain/langgraph/prebuilt";
import wxflows from "@wxflows/sdk/langchain";

// Customers at: https://introspection.apis.stepzen.com/customers
// Comments at: https://dummyjson.com/comments

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