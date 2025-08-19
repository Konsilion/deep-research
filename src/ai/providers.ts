import { createFireworks } from '@ai-sdk/fireworks';
import { createOpenAI } from '@ai-sdk/openai';
import {
  extractReasoningMiddleware,
  LanguageModelV1,
  wrapLanguageModel,
} from 'ai';
import { getEncoding } from 'js-tiktoken';

import { RecursiveCharacterTextSplitter } from './text-splitter';

// Configuration pour Ollama avec l'endpoint correct
const ollamaEndpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
const ollama = createOpenAI({
  baseURL: `${ollamaEndpoint}/v1`,
  apiKey: 'ollama', // Valeur factice requise par l'API
});

// Variable pour conserver l'instance du modèle
let modelInstance: LanguageModelV1 | undefined = undefined;
let introductionModelInstance: LanguageModelV1 | undefined = undefined;

// Déterminer si les modèles utilisent le raisonnement par défaut
const useThinkingModels = process.env.THINKING_MODEL !== 'false';

function createModelWithReasoning(modelName: string): LanguageModelV1 {
  console.log(
    `Création du modèle ${modelName} avec middleware de raisonnement`,
  );
  return wrapLanguageModel({
    model: ollama(modelName) as LanguageModelV1,
    middleware: extractReasoningMiddleware({ tagName: 'think' }),
  });
}

function createSimpleModel(modelName: string): LanguageModelV1 {
  console.log(
    `Création du modèle ${modelName} sans middleware de raisonnement`,
  );
  return ollama(modelName, {
    structuredOutputs: true,
  }) as LanguageModelV1;
}

export function getModel(): LanguageModelV1 {
  if (!modelInstance) {
    const modelName = process.env.CUSTOM_MODEL || 'llama3';

    // Crée le modèle avec ou sans raisonnement selon la configuration
    if (useThinkingModels) {
      modelInstance = createModelWithReasoning(modelName);
    } else {
      modelInstance = createSimpleModel(modelName);
    }

    console.log(
      `Modèle principal initialisé: ${modelName} (avec raisonnement: ${useThinkingModels})`,
    );
  }

  return modelInstance;
}

export function getIntroductionModel(): LanguageModelV1 {
  if (!introductionModelInstance) {
    const modelName =
      process.env.CUSTOM_MODEL_INTRO || process.env.CUSTOM_MODEL || 'llama3';

    // Le modèle d'introduction est toujours créé sans middleware de raisonnement
    introductionModelInstance = createSimpleModel(modelName);

    console.log(
      `Modèle d'introduction initialisé: ${modelName} (toujours sans raisonnement)`,
    );
  }

  return introductionModelInstance;
}

const MinChunkSize = 140;
const encoder = getEncoding('o200k_base');

// trim prompt to maximum context size
export function trimPrompt(
  prompt: string,
  contextSize = Number(process.env.CONTEXT_SIZE) || 128_000,
) {
  if (!prompt) {
    return '';
  }

  // Ajouter une marge de sécurité fixe de 500 tokens
  const securityMargin = 500;
  const adjustedContextSize = Math.max(0, contextSize - securityMargin);

  // Le reste de votre logique actuelle avec cette nouvelle limite ajustée
  const safeContextSize = Math.floor(adjustedContextSize * 0.9);

  const length = encoder.encode(prompt).length;
  if (length <= adjustedContextSize) {
    return prompt;
  }

  console.log(
    `Prompt trop long : ${length} tokens, réduction à ${adjustedContextSize} tokens (limite originale: ${contextSize}, marge: ${securityMargin})`,
  );

  // Calcul plus agressif pour la réduction de taille
  const overflowTokens = length - safeContextSize;
  // Multiplier par 4 au lieu de 3 pour être plus agressif dans la réduction
  const chunkSize = Math.max(MinChunkSize, prompt.length - overflowTokens * 4);

  // Pour les contenus très longs, prioriser le début et la fin du contenu
  if (length > contextSize * 1.5) {
    const startChunk = prompt.substring(0, Math.floor(chunkSize * 0.7)); // 70% du début
    const endChunk = prompt.substring(
      prompt.length - Math.floor(chunkSize * 0.3),
    ); // 30% de la fin
    console.log(
      `Réduction drastique : combinaison du début et de la fin du contenu`,
    );
    return (
      startChunk +
      '\n\n[...Contenu intermédiaire omis pour respecter la limite de contexte...]\n\n' +
      endChunk
    );
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: 0,
  });

  try {
    const trimmedPrompt = splitter.splitText(prompt)[0] ?? '';

    // Si la réduction n'est pas suffisante, faire une coupe brutale
    if (encoder.encode(trimmedPrompt).length > safeContextSize) {
      console.log(
        `La réduction avec splitText n'est pas suffisante, coupe brutale appliquée`,
      );
      return prompt.slice(0, Math.floor(chunkSize * 0.9));
    }

    return trimmedPrompt;
  } catch (error) {
    console.error('Erreur lors du découpage du prompt:', error);
    // En cas d'erreur, revenir à une méthode simple mais fiable
    return prompt.slice(0, Math.floor(chunkSize * 0.9));
  }
}
