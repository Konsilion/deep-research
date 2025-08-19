import FirecrawlApp, { SearchResponse } from '@mendable/firecrawl-js';
import { generateObject } from 'ai';
import { compact } from 'lodash-es';
import pLimit from 'p-limit';
import { z } from 'zod';

import { getModel, trimPrompt } from './ai/providers';
import { systemPrompt } from './prompt';

function log(...args: any[]) {
  console.log(...args);
}

// Type pour suivre la progression de la recherche
export type ResearchProgress = {
  currentDepth: number; // Niveau actuel de profondeur
  totalDepth: number; // Profondeur totale
  currentBreadth: number; // Ampleur actuelle de la recherche
  totalBreadth: number; // Ampleur totale
  currentQuery?: string; // Requête actuelle
  totalQueries: number; // Nombre total de requêtes
  completedQueries: number; // Nombre de requêtes complétées
};

// Résultat final de la recherche
type ResearchResult = {
  learnings: string[]; // Enseignements tirés
  visitedUrls: string[]; // URLs visitées
};

// Limite de concurrence pour les appels Firecrawl
const ConcurrencyLimit = Number(process.env.FIRECRAWL_CONCURRENCY) || 2;

// Initialisation de Firecrawl
const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_KEY ?? '',
  apiUrl: process.env.FIRECRAWL_BASE_URL,
});







async function generateSerpQueries({
  query,
  numQueries = 3,
  learnings,
}: {
  query: string;
  numQueries?: number;
  learnings?: string[];
}) {
  const res = await generateObject({
    model: getModel(),
    system: systemPrompt(),
    prompt: `À partir de la requête utilisateur suivante, générez une liste de requêtes SERP pour explorer le sujet. Retournez un maximum de ${numQueries} requêtes uniques et spécifiques : <prompt>${query}</prompt>\n\n${
      learnings
        ? `Voici des enseignements tirés de recherches précédentes, utilisez-les pour générer des requêtes plus spécifiques : ${learnings.join(
            '\n',
          )}`
        : ''
    }`,
    schema: z.object({
      queries: z
        .union([
          // Format attendu: array d'objets avec query et researchGoal
          z.array(
            z.object({
              query: z.string().describe('Requête SERP'),
              researchGoal: z
                .string()
                .describe('Objectif de recherche pour cette requête'),
            }),
          ),
          // Format alternatif: array de strings (pour compatibilité avec différents modèles)
          z.array(z.string()),
        ])
        .transform((queries) => {
          // Si c'est déjà un array d'objets, le retourner tel quel
          if (queries.length > 0 && typeof queries[0] === 'object' && 'query' in queries[0]) {
            return queries as Array<{ query: string; researchGoal: string }>;
          }
          // Si c'est un array de strings, les transformer en objets
          return (queries as string[]).map((q) => ({
            query: q,
            researchGoal: `Recherche d'informations pour: ${q}`,
          }));
        })
        .describe(`Liste de requêtes SERP, max de ${numQueries}`),
    }),
  });
  log(`Créé ${res.object.queries.length} requêtes`, res.object.queries);

  return res.object.queries.slice(0, numQueries);
}









async function processSerpResult({
  query,
  result,
  numLearnings = 3,
  numFollowUpQuestions = 3,
}: {
  query: string;
  result: SearchResponse;
  numLearnings?: number;
  numFollowUpQuestions?: number;
}) {
  // Limiter le nombre de contenus traités pour éviter les dépassements de contexte
  const maxContentItems = 3; // Réduire de 5 à 3
  const contents = compact(result.data.slice(0, maxContentItems).map(item => item.markdown)).map(
    content => trimPrompt(content, 10_000), // Limiter chaque contenu à 10K tokens max
  );
  log(`Exécution de ${query}, trouvé ${contents.length} contenus`);

  const prompt = `À partir des contenus suivants issus d'une recherche pour la requête <query>${query}</query>, extrayez une liste d'enseignements. Retournez un maximum de ${numLearnings} enseignements uniques et concis, aussi détaillés que possible :\n\n<contents>${contents
    .map((content, i) => `<content ${i+1}>\n${content}\n</content ${i+1}>`)
    .join('\n')}</contents>`;

  const res = await generateObject({
    model: getModel(),
    abortSignal: AbortSignal.timeout(60_000),
    system: systemPrompt(),
    prompt: trimPrompt(prompt),
    schema: z.object({
      learnings: z
        .array(z.string())
        .describe(`Liste d'enseignements, max de ${numLearnings}`),
      followUpQuestions: z
        .array(z.string())
        .describe(
          `Liste de questions de suivi pour approfondir la recherche, max de ${numFollowUpQuestions}`,
        ),
    }),
  });
  log(`Créé ${res.object.learnings.length} enseignements`, res.object.learnings);

  return res.object;
}











/**
 * Génère un rapport final basé sur les enseignements et les URLs visitées.
 * Appelé par l'API pour produire un rapport utilisateur complet.
 */
export async function writeFinalReport({
  prompt,
  learnings,
  visitedUrls,
}: {
  prompt: string;
  learnings: string[];
  visitedUrls: string[];
}) {
  const learningsString = learnings
    .map(learning => `<learning>\n${learning}\n</learning>`)
    .join('\n');

  const res = await generateObject({
    model: getModel(),
    system: systemPrompt(),
    prompt: trimPrompt(
      `À partir de la requête utilisateur suivante, rédigez un rapport final détaillé en utilisant les enseignements de la recherche :\n\n<prompt>${prompt}</prompt>\n\n<learnings>\n${learningsString}\n</learnings>`,
    ),
    schema: z.object({
      reportMarkdown: z
        .string()
        .describe('Rapport final au format Markdown'),
    }),
  });

  // Ajoute une section des sources au rapport
  const urlsSection = `\n\n## Sources\n\n${visitedUrls.map(url => `- ${url}`).join('\n')}`;
  return res.object.reportMarkdown + urlsSection;
}

/**
 * Génère une réponse concise basée sur les enseignements.
 * Appelé par l'API pour répondre à une question spécifique.
 */
export async function writeFinalAnswer({
  prompt,
  learnings,
}: {
  prompt: string;
  learnings: string[];
}) {
  const learningsString = learnings
    .map(learning => `<learning>\n${learning}\n</learning>`)
    .join('\n');

  const res = await generateObject({
    model: getModel(),
    system: systemPrompt(),
    prompt: trimPrompt(
      `À partir de la requête utilisateur suivante, rédigez une réponse concise en utilisant les enseignements :\n\n<prompt>${prompt}</prompt>\n\n<learnings>\n${learningsString}\n</learnings>`,
    ),
    schema: z.object({
      exactAnswer: z
        .string()
        .describe('Réponse finale concise'),
    }),
  });

  return res.object.exactAnswer;
}

/**
 * Fonction principale pour effectuer une recherche approfondie.
 * Appelée par l'API ou d'autres modules pour effectuer une recherche récursive.
 */
export async function deepResearch({
  query,
  breadth,
  depth,
  learnings = [],
  visitedUrls = [],
  onProgress,
}: {
  query: string;
  breadth: number;
  depth: number;
  learnings?: string[];
  visitedUrls?: string[];
  onProgress?: (progress: ResearchProgress) => void;
}): Promise<ResearchResult> {
  const progress: ResearchProgress = {
    currentDepth: depth,
    totalDepth: depth,
    currentBreadth: breadth,
    totalBreadth: breadth,
    totalQueries: 0,
    completedQueries: 0,
  };

  const reportProgress = (update: Partial<ResearchProgress>) => {
    Object.assign(progress, update);
    onProgress?.(progress);
  };

  const serpQueries = await generateSerpQueries({
    query,
    learnings,
    numQueries: breadth,
  });

  reportProgress({
    totalQueries: serpQueries.length,
    currentQuery: serpQueries[0]?.query,
  });

  const limit = pLimit(ConcurrencyLimit);

  const results = await Promise.all(
    serpQueries.map(serpQuery =>
      limit(async () => {
        try {
          const result = await firecrawl.search(serpQuery.query, {
            timeout: 15000,
            limit: 5,
            scrapeOptions: { formats: ['markdown'] },
          });

          // Récupère les URLs et enseignements
          const newUrls = compact(result.data.map(item => item.url));
          const newBreadth = Math.ceil(breadth / 2);
          const newDepth = depth - 1;

          const newLearnings = await processSerpResult({
            query: serpQuery.query,
            result,
            numFollowUpQuestions: newBreadth,
          });
          const allLearnings = [...learnings, ...newLearnings.learnings];
          const allUrls = [...visitedUrls, ...newUrls];

          if (newDepth > 0) {
            log(
              `Recherche approfondie, ampleur : ${newBreadth}, profondeur : ${newDepth}`,
            );

            reportProgress({
              currentDepth: newDepth,
              currentBreadth: newBreadth,
              completedQueries: progress.completedQueries + 1,
              currentQuery: serpQuery.query,
            });

            const nextQuery = `
            Objectif de recherche précédent : ${serpQuery.researchGoal}
            Suivi : ${newLearnings.followUpQuestions.map(q => `\n${q}`).join('')}
          `.trim();

            return deepResearch({
              query: nextQuery,
              breadth: newBreadth,
              depth: newDepth,
              learnings: allLearnings,
              visitedUrls: allUrls,
              onProgress,
            });
          } else {
            reportProgress({
              currentDepth: 0,
              completedQueries: progress.completedQueries + 1,
              currentQuery: serpQuery.query,
            });
            return {
              learnings: allLearnings,
              visitedUrls: allUrls,
            };
          }
        } catch (e: any) {
          log(`Erreur lors de la requête : ${serpQuery.query}`, e);
          return {
            learnings: [],
            visitedUrls: [],
          };
        }
      }),
    ),
  );

  return {
    learnings: [...new Set(results.flatMap(r => r.learnings))],
    visitedUrls: [...new Set(results.flatMap(r => r.visitedUrls))],
  };
}
