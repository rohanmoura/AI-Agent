import { v } from "convex/values";
import { mutation, query } from "./_generated/server";



export const createChat = mutation({
    args: {
        title: v.string(),
    },
    async handler(ctx, args_0) {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const chat = await ctx.db.insert("chats", {
            title: args_0.title,
            userId: identity.subject,
            createdAt: Date.now(),
        })

        return chat;
    },
});

export const deleteChat = mutation({
    args: {
        id: v.id("chats"),
    },
    async handler(ctx, args_0) {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const chat = await ctx.db.get(args_0.id);
        if (!chat || chat.userId !== identity.subject) {
            throw new Error("Not authorized");
        }

        // Delete all messages in the chat 
        const messages = await ctx.db.query("messages").withIndex("by_chat", (q) => q.eq("chatId", args_0.id)).collect();
        for (const message of messages) {
            await ctx.db.delete(message._id);
        }

        // Delete the chat
        await ctx.db.delete(args_0.id);
    },
})

export const listChats = query({
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }

        const chats = await ctx.db.query("chats").withIndex("by_user", (q) => q.eq("userId", identity.subject)).order("desc").collect();

        return chats;
    }
})