import { generateObject } from 'ai';
import { z } from 'zod';

import { getModel } from './ai/providers';
import { getIntroductionModel } from './ai/providers';


import { systemPrompt } from './prompt';

export async function generateFeedback({
  query,
  numQuestions = 3,
  introduction,
}: {
  query: string;
  numQuestions?: number;
  introduction?: boolean;
}) {
  const model = introduction ? getIntroductionModel() : getModel();
  const userFeedback = await generateObject({
    system: systemPrompt(),
    prompt: `
À partir de la requête suivante, pose DES QUESTIONS DE SUIVI EN FRANÇAIS pour clarifier la direction de la recherche.
Retourne AU MAXIMUM ${numQuestions} questions (tu peux en poser moins si la requête est déjà claire).

Règles :
- Reste strictement dans le périmètre du sujet demandé ; n'introduis AUCUN thème non lié.
- Conserve et répercute les entités clés EXACTEMENT telles qu'elles apparaissent (ex. noms propres, lieux, concept, etc.) dans tes questions.
- Priorise la désambiguïsation : orthographe/alias, localisation associée, domaine/activité/organisation, période temporelle (dates).
- Une seule idée par question ; formulations courtes, précises et actionnables.
- Réponds UNIQUEMENT par la liste des questions, sans préambule ni explications additionnelles.

<query>${query}</query>`.trim(),
    schema: z.object({
      questions: z
        .array(z.string())
        .describe(
          `Questions de suivi pour clarifier la direction de la recherche, maximum ${numQuestions}`,
        ),
    }),
  });

  return userFeedback.object.questions.slice(0, numQuestions);
}
