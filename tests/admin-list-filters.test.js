import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readAdminListFilters, updateAdminListFilter, isReadyForSending, matchesSupportOrder,
} from '../client/lib/adminListFilters.js';

test('shareable list filters preserve existing encrypted support context and URL history state', () => {
  const existing = new URLSearchParams('c=ec1_private-context&secret=existing');
  const withSearch = updateAdminListFilter(existing, 'busca', 'Maria de Fátima');
  const withStatus = updateAdminListFilter(withSearch, 'situacao', 'ready');
  assert.deepEqual(readAdminListFilters(withStatus, ['all', 'ready']), {
    search: 'Maria de Fátima', filter: 'ready',
  });
  assert.equal(withStatus.get('c'), 'ec1_private-context');
  assert.equal(withStatus.get('secret'), 'existing');
  const cleared = updateAdminListFilter(withStatus, 'situacao', 'all');
  assert.equal(cleared.has('situacao'), false);
  assert.equal(cleared.get('busca'), 'Maria de Fátima');
  assert.equal(readAdminListFilters(new URLSearchParams('situacao=invalid'), ['all', 'ready']).filter, 'all');
});

test('ready for sending requires Pix confirmed and submission, excluding campaign gifts', () => {
  assert.equal(isReadyForSending({status:'paid',submitted:true}), true);
  assert.equal(isReadyForSending({status:'preparing',submitted:true}), true);
  assert.equal(isReadyForSending({status:'delivered',submitted:true}), true);
  assert.equal(isReadyForSending({status:'paid',submitted:false}), false);
  assert.equal(isReadyForSending({status:'pending',submitted:true}), false);
  assert.equal(isReadyForSending({status:'paid',submitted:true,gift:true}), false);
});

test('support search filters by sender, recipient and order ID without accents', () => {
  const ready = {id:'EJC-123456789ABC',recipient_name:'João',sender_name:'Márcia',recipient_slug:'joao',
    status:'paid',submitted:true,has_content:true};
  const empty = {...ready,id:'EJC-123456789ABD',status:'paid',submitted:false,has_content:false};
  assert.equal(matchesSupportOrder(ready,'marcia','ready'),true);
  assert.equal(matchesSupportOrder(ready,'Joao','ready'),true);
  assert.equal(matchesSupportOrder(ready,'789ABC','ready'),true);
  assert.equal(matchesSupportOrder(empty,'','ready'),false);
  assert.equal(matchesSupportOrder(empty,'','empty-paid-draft'),true);
  assert.equal(matchesSupportOrder(empty,'','paid-draft'),true);
  assert.equal(matchesSupportOrder({...ready,gift:true},'','all'),false);
});
