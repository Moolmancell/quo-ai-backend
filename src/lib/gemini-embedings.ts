import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

export const googleGenAIEmbeddings = class extends GoogleGenerativeAIEmbeddings {
    _convertToContent(text) {
		const cleanedText = this.stripNewLines ? text.replace(/\n/g, " ") : text;
		return {
			content: {
				role: "user",
				parts: [{ text: cleanedText }]
			},
			taskType: this.taskType,
			title: this.title,
			outputDimensionality: 768
		};
	}
}