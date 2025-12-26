import { z } from "zod";
import express from "express";
import { auth } from "../lib/auth";
import { APIError } from "better-auth/api";

const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
});

export async function loginController(req: express.Request, res: express.Response) {
    console.log("Request Body Received:", req.body);

    try {
        // Validate input
        const validatedData = loginSchema.parse(req.body);

        // Call better-auth internal signup
        const data = await auth.api.signInEmail({
            body: {
                email: validatedData.email, // required
                password: validatedData.password, // required
                rememberMe: true,
            },
        });

        console.log("User logged in successfully:", data);

        return res.status(201).json({
            message: "Logged in successfully",
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