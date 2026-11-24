import {describe,it,expect} from 'vitest';
import {newPhraseSchema} from '@/lib/sayyad/phrases';
describe('new phrase validation',()=>{
  it('rejects too short',()=>expect(newPhraseSchema.safeParse({phrase:'  اب '}).success).toBe(false));
  it('rejects URLs',()=>{expect(newPhraseSchema.safeParse({phrase:'https://example.com'}).success).toBe(false);expect(newPhraseSchema.safeParse({phrase:'www.example.com رسوم'}).success).toBe(false);});
  it('rejects over 120 chars',()=>expect(newPhraseSchema.safeParse({phrase:'ا'.repeat(121)}).success).toBe(false));
  it('accepts valid and trims',()=>{const r=newPhraseSchema.safeParse({phrase:'  تجديد ملكية سيارة أونلاين ',entity_id:null});expect(r.success&&r.data.phrase).toBe('تجديد ملكية سيارة أونلاين');});
});
