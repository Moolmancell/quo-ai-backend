import { z } from "zod";
import express from "express";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { APIError } from "better-auth/api";

const signupSchema = z.object({
    username: z.string().min(3).max(20),
    email: z.string().email("Invalid email address"),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[a-z]/, "Must contain at least one lowercase letter")
        .regex(/[A-Z]/, "Must contain at least one uppercase letter")
        .regex(/[0-9]/, "Must contain at least one number")
        .regex(/[^a-zA-Z0-9]/, "Must contain at least one special character"),
    confirm_password: z.string()
}).refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ["confirm_password"],
});


export async function signUpController(req: express.Request, res: express.Response) {
    console.log("Request Body Received:", req.body);

    try {
        // Validate input
        const validatedData = signupSchema.parse(req.body);

        // Check if email is taken
        const existingUser = await prisma.user.findUnique({
            where: { email: validatedData.email }
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                errors: "Email is already taken"
            });
        }

        // Call better-auth internal signup
        const data = await auth.api.signUpEmail({
            body: {
                email: validatedData.email, // required
                password: validatedData.password, // required
                name: validatedData.username, // required
            },
        });
        console.log("User created successfully:", data);
        return res.status(201).json({
            message: "User created successfully",
            data
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error("Validation error:", error);
            const errorMessages = error.issues.map(issue => issue.message)
            return res.status(400).json({
                success: false,
                errors: errorMessages[0]
            });
        }

        if ((error instanceof APIError)) {
            return res.status(401).json({
                success: false,
                message: error.message
            });
        }

        console.error("Validation error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}