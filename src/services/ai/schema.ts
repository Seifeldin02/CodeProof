export const AI_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["architecture", "skills", "gaps", "interviewQuestions"],
  properties: {
    architecture: {
      type: "object",
      additionalProperties: false,
      required: ["purpose", "overview", "majorModules", "boundaries", "dataFlow", "engineeringDecisions", "importantFiles", "origin"],
      properties: {
        purpose: { type: "string" },
        overview: { type: "string" },
        majorModules: { type: "array", items: { type: "string" } },
        boundaries: { type: "array", items: { type: "string" } },
        dataFlow: { type: "array", items: { type: "string" } },
        engineeringDecisions: { type: "array", items: { type: "string" } },
        importantFiles: { type: "array", items: { type: "string" } },
        origin: { type: "string", enum: ["ai_interpretation"] },
      },
    },
    skills: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["skill", "level", "explanation", "evidence", "origin"],
        properties: {
          skill: { type: "string" },
          level: { type: "string", enum: ["Strong Evidence", "Good Evidence", "Partial Evidence", "Limited Evidence", "Insufficient Evidence"] },
          explanation: { type: "string" },
          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["file", "summary", "implementationExample", "origin"],
              properties: {
                file: { type: "string" },
                summary: { type: "string" },
                implementationExample: { type: "string" },
                origin: { type: "string", enum: ["ai_interpretation"] },
              },
            },
          },
          origin: { type: "string", enum: ["ai_interpretation"] },
        },
      },
    },
    gaps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "explanation", "checkedFiles", "origin"],
        properties: {
          area: { type: "string" },
          explanation: { type: "string" },
          checkedFiles: { type: "array", items: { type: "string" } },
          origin: { type: "string", enum: ["ai_interpretation"] },
        },
      },
    },
    interviewQuestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "relatedSkill", "difficulty", "files", "relevance", "origin"],
        properties: {
          question: { type: "string" },
          relatedSkill: { type: "string" },
          difficulty: { type: "string", enum: ["Foundational", "Intermediate", "Advanced"] },
          files: { type: "array", items: { type: "string" } },
          relevance: { type: "string" },
          origin: { type: "string", enum: ["ai_interpretation"] },
        },
      },
    },
  },
} as const;
