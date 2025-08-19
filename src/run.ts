import * as fs from 'fs/promises';
import * as readline from 'readline';

import { getModel } from './ai/providers';
import {
  deepResearch,
  writeFinalAnswer,
  writeFinalReport,
} from './deep-research';
import { generateFeedback } from './feedback';

// Fonction utilitaire pour des journaux cohérents
function log(...args: any[]) {
  console.log(...args);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Fonction utilitaire pour obtenir une entrée utilisateur
function askQuestion(query: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// Exécuter l'agent
async function run() {
  console.log('Modèle utilisé : ', getModel().modelId);

  // Obtenir la requête initiale
  const initialQuery = await askQuestion('Que souhaitez-vous rechercher ? ');

  // Obtenir les paramètres de largeur et de profondeur
  const breadth =
    parseInt(
      await askQuestion(
        'Entrez la largeur de recherche (recommandé 2-10, par défaut 4) : ',
      ),
      10,
    ) || 4;
  const depth =
    parseInt(
      await askQuestion(
        'Entrez la profondeur de recherche (recommandé 1-5, par défaut 2) : ',
      ),
      10,
    ) || 2;

  // Toujours définir isReport sur true pour générer un rapport
  const isReport = true;

  let combinedQuery = initialQuery;
  if (isReport) {
    log(`Création du plan de recherche...`);

    // Générer des questions de suivi
    const followUpQuestions = await generateFeedback({
      query: initialQuery,
      introduction: true,
    });

    log(
      '\nPour mieux comprendre vos besoins de recherche, veuillez répondre à ces questions complémentaires :',
    );

    // Collecter les réponses aux questions de suivi
    const answers: string[] = [];
    for (const question of followUpQuestions) {
      const answer = await askQuestion(`\n${question}\nVotre réponse : `);
      answers.push(answer);
    }

    // Combiner toutes les informations pour la recherche approfondie
    combinedQuery = `
Requête initiale : ${initialQuery}
Questions complémentaires et réponses :
${followUpQuestions.map((q: string, i: number) => `Q : ${q}\nR : ${answers[i]}`).join('\n')}
`;
  }

  log('\nDémarrage de la recherche...\n');

  const { learnings, visitedUrls } = await deepResearch({
    query: combinedQuery,
    breadth,
    depth,
  });

  log(`\n\nRésultats :\n\n${learnings.join('\n')}`);
  log(`\n\nURLs visitées (${visitedUrls.length}) :\n\n${visitedUrls.join('\n')}`);
  log('Rédaction du rapport final...');

  if (isReport) {
    const report = await writeFinalReport({
      prompt: combinedQuery,
      learnings,
      visitedUrls,
    });

    await fs.writeFile('rapport.md', report, 'utf-8');
    console.log(`\n\nRapport Final :\n\n${report}`);
    console.log('\nLe rapport a été sauvegardé dans rapport.md');
  } else {
    const answer = await writeFinalAnswer({
      prompt: combinedQuery,
      learnings,
    });

    await fs.writeFile('reponse.md', answer, 'utf-8');
    console.log(`\n\nRéponse Finale :\n\n${answer}`);
    console.log('\nLa réponse a été sauvegardée dans reponse.md');
  }

  rl.close();
}

run().catch(console.error);
