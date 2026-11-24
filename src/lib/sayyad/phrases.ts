import { z } from 'zod';
/** Investigator-added hunt phrase: plain search text, never a URL. */
export const newPhraseSchema=z.object({
  phrase:z.string().trim().min(3,'العبارة قصيرة جداً').max(120,'العبارة طويلة جداً').refine(p=>!/http|www\./i.test(p),'لا تكتب روابط في العبارة'),
  entity_id:z.string().uuid().nullable().optional(),
});
export const phraseKey=(p:string)=>p.trim().toLowerCase();
