INSERT INTO public.search_phrases (phrase, entity_id, active)
SELECT v.phrase, e.id, true
FROM (VALUES
 ('salik recharge online','Salik'),('pay salik fine','Salik'),('darb abu dhabi top up','Darb Abu Dhabi'),
 ('pay dubai traffic fines','Dubai Police'),('pay abu dhabi traffic fines','Abu Dhabi Police'),('rta fine payment','RTA Dubai'),
 ('uae pass login','UAE PASS'),('emirates id renewal online','ICP'),('visa fine payment uae','ICP'),
 ('dewa bill payment','DEWA'),('etisalat bill payment','e& (Etisalat)'),('du bill payment','du'),
 ('emirates post parcel delivery fee','Emirates Post'),('aramex customs fee payment','Aramex'),('tamm abu dhabi services','TAMM Abu Dhabi')
) AS v(phrase, name_en)
LEFT JOIN public.entities e ON e.name_en = v.name_en
WHERE NOT EXISTS (SELECT 1 FROM public.search_phrases s WHERE lower(s.phrase) = lower(v.phrase));