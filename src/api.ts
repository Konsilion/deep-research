import cors from 'cors';
import express, { Request, Response } from 'express';

import {
  deepResearch,
  writeFinalAnswer,
  writeFinalReport,
} from './deep-research';

const app = express();
const port = process.env.PORT || 3051;

// Middleware - Configuration des middlewares
app.use(cors());
app.use(express.json());

// Fonction utilitaire pour des logs cohérents
function log(...args: any[]) {
  console.log(...args);
}

// Point d'entrée API pour exécuter une recherche
app.post('/api/research', async (req: Request, res: Response) => {
  try {
    const { query, depth = 3, breadth = 3 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'La requête est obligatoire' });
    }

    log('\nDébut de la recherche...\n');

    const { learnings, visitedUrls } = await deepResearch({
      query,
      breadth,
      depth,
    });

    log(`\n\nEnseignements :\n\n${learnings.join('\n')}`);
    log(
      `\n\nURLs visitées (${visitedUrls.length}) :\n\n${visitedUrls.join('\n')}`,
    );

    const answer = await writeFinalAnswer({
      prompt: query,
      learnings,
    });

    // Retourner les résultats
    return res.json({
      success: true,
      answer,
      learnings,
      visitedUrls,
    });
  } catch (error: unknown) {
    console.error("Erreur dans l'API de recherche :", error);
    return res.status(500).json({
      error: 'Une erreur est survenue lors de la recherche',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Point d'entrée API pour générer un rapport
app.post('/api/generate-report', async (req: Request, res: Response) => {
  try {
    const { query, depth = 3, breadth = 3 } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'La requête est obligatoire' });
    }
    log('\nDébut de la recherche...\n');
    const { learnings, visitedUrls } = await deepResearch({
      query,
      breadth,
      depth,
    });
    log(`\n\nEnseignements :\n\n${learnings.join('\n')}`);
    log(
      `\n\nURLs visitées (${visitedUrls.length}) :\n\n${visitedUrls.join('\n')}`,
    );
    const report = await writeFinalReport({
      prompt: query,
      learnings,
      visitedUrls,
    });

    return report;
  } catch (error: unknown) {
    console.error("Erreur dans l'API de génération de rapport :", error);
    return res.status(500).json({
      error: 'Une erreur est survenue lors de la recherche',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Démarrer le serveur
app.listen(port, () => {
  console.log(
    `API de recherche approfondie en cours d'exécution sur le port ${port}`,
  );
});

export default app;
