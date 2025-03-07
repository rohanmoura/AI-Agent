import { v } from "convex/values";
import { mutation, query } from "./_generated/server";



const SHOW_COMMENTS = false;

export const list = query({
    args: {
        chatId: v.id("chats"),
    },
    async handler(ctx, args_0) {
        const messages = await ctx.db.query("messages").withIndex("by_chat", (q) => q.eq("chatId", args_0.chatId)).order("asc").collect();

        if (SHOW_COMMENTS) {
            console.log("Retrieved messages:", {
                chatId: args_0.chatId,
                count: messages.length,
            })
        }

        return messages;
    },
})

export const send = mutation({
    args: {
        chatId: v.id("chats"),
        content: v.string(),
    },
    async handler(ctx, args_0) {
        const messageId = await ctx.db.insert("messages", {
            chatId: args_0.chatId,
            content: args_0.content.replace(/\\n/g, "\\n"),
            role: "user",
            createdAt: Date.now(),
        });

        return messageId;
    },
})

export const store = mutation({
    args: {
        chatId: v.id("chats"),
        content: v.string(),
        role: v.union(v.literal("user"), v.literal("assistant")),
    },
    async handler(ctx, args_0) {
        const messageId = await ctx.db.insert("messages", {
            chatId: args_0.chatId,
            content: args_0.content.replace(/\\n/g, "\\n").replace(/\\/g, "\\\\"),
            role: args_0.role,
            createdAt: Date.now(),
        })
        return messageId;
    },
})


export const getLastMessage = query({
    args: {
        chatId: v.id("chats"),
    },
    async handler(ctx, args_0) {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }
        const chat = await ctx.db.get(args_0.chatId);
        if (!chat || chat.userId !== identity.subject) {
            throw new Error("Unauthorized");
        }
        const message = await ctx.db.query("messages").withIndex("by_chat", (q) => q.eq("chatId", args_0.chatId)).order("desc").first();

        return message;
    },
})