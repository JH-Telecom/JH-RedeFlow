import assert from 'node:assert/strict';
import test from 'node:test';
import { processingFromRow, processingSelect } from '../src/integrations/supabase/client.js';

test('activation processing reads only the requested JSON fields', () => {
  const paths = ['officeTrack', '_analysis.olt', '_analysis.slot_pon'];
  assert.equal(processingSelect(), 'activation_id, extracted_data, created_at');
  assert.equal(processingSelect(paths), 'activation_id, created_at, f0:extracted_data->officeTrack, f1:extracted_data->_analysis->olt, f2:extracted_data->_analysis->slot_pon');
  const row = { activation_id: 'a', f0: '123', f1: 'VIP-01', f2: ['1/5'] };
  assert.deepEqual(processingFromRow(row, paths), { officeTrack: '123', _analysis: { olt: 'VIP-01', slot_pon: ['1/5'] } });
  assert.deepEqual(processingFromRow({ activation_id: 'a', f0: null }, paths), {});
});
