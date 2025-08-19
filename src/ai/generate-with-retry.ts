import { generateObject, LanguageModelV1 } from 'ai';
import { z } from 'zod';

export interface GenerateObjectOptions<T> {
  model: LanguageModelV1;
  system?: string;
  prompt: string;
  schema: z.ZodSchema<T>;
  abortSignal?: AbortSignal;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Wrapper around generateObject with retry logic and error handling for AI models
 * that may return empty or malformed responses.
 */
export async function generateObjectWithRetry<T>({
  model,
  system,
  prompt,
  schema,
  abortSignal,
  maxRetries = 3,
  retryDelay = 1000,
}: GenerateObjectOptions<T>): Promise<{ object: T }> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateObject({
        model,
        system,
        prompt,
        schema,
        abortSignal,
      });

      // Validate that we actually got a result
      if (!result.object) {
        throw new Error('No object generated from AI model');
      }

      return result;
    } catch (error) {
      lastError = error as Error;

      console.warn(
        `Attempt ${attempt}/${maxRetries} failed for generateObject:`,
        error instanceof Error ? error.message : String(error),
      );

      // If it's the last attempt, we'll throw the error below
      if (attempt === maxRetries) {
        break;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  // If all retries failed, provide a fallback based on the schema
  console.error(
    `All ${maxRetries} attempts failed for generateObject. Providing fallback response.`,
    lastError,
  );

  // Try to create a fallback response based on the schema
  const fallback = createFallbackResponse(schema);
  if (fallback) {
    return { object: fallback };
  }

  // If we can't create a fallback, throw the last error
  throw lastError || new Error('Failed to generate object after retries');
}

/**
 * Creates a fallback response based on the schema structure
 */
function createFallbackResponse<T>(schema: z.ZodSchema<T>): T | null {
  try {
    // Try to parse the schema to understand its structure
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const fallback: any = {};

      for (const [key, fieldSchema] of Object.entries(shape)) {
        if (fieldSchema instanceof z.ZodArray) {
          fallback[key] = [];
        } else if (fieldSchema instanceof z.ZodString) {
          fallback[key] = '';
        } else if (fieldSchema instanceof z.ZodNumber) {
          fallback[key] = 0;
        } else if (fieldSchema instanceof z.ZodBoolean) {
          fallback[key] = false;
        } else if (fieldSchema instanceof z.ZodObject) {
          fallback[key] = {};
        } else {
          fallback[key] = null;
        }
      }

      return fallback as T;
    }
  } catch (error) {
    console.warn('Could not create fallback response:', error);
  }

  return null;
}
