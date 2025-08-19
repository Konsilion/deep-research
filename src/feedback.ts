import { generateObject } from 'ai';
import { z } from 'zod';

import { getModel } from './ai/providers';
import { systemPrompt } from './prompt';

export async function generateFeedback({
  query,
  numQuestions = 3,
}: {
  query: string;
  numQuestions?: number;
}) {
  const userFeedback = await generateObject({
    model: getModel(),
    system: systemPrompt(),
    prompt: `À partir de la requête utilisateur suivante, posez des questions de suivi pour clarifier la direction de recherche. 

CONTRAINTES IMPORTANTES :
- Répondez TOUJOURS en français
- Restez strictement dans le périmètre de la requête originale
- Maintenez les entités clés (noms de personnes entre guillemets, lieux, etc.)
- Évitez d'introduire des sujets non liés à la requête
- Si une personne et un lieu sont mentionnés, gardez-les en contexte
- Privilégiez la désambiguïsation pour les requêtes concernant des personnes

PRIORITÉS POUR LA DÉSAMBIGUÏSATION :
- Orthographe/aliases du nom de la personne
- Précisions géographiques et temporelles
- Domaine d'activité ou profession
- Période ou époque concernée

Retournez un maximum de ${numQuestions} questions, mais n'hésitez pas à en retourner moins si la requête originale est déjà claire.

<query>${query}</query>`,
    schema: z.object({
      questions: z
        .array(z.string())
        .describe(
          `Questions de suivi pour clarifier la direction de recherche, maximum ${numQuestions}`,
        ),
    }),
  });

  return userFeedback.object.questions.slice(0, numQuestions);
}
