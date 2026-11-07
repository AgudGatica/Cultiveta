/**
 * Guardar sin conexión (revisión de código del 2026-11-07):
 *  1. Una escritura que nunca responde no frena; una rechazada avisa; una confirmada avisa que terminó.
 *  2. Ningún servicio espera a la nube y Firestore guarda su cola en el celular.
 *  3. Al abrir sin conexión, un dato nuevo no hace desaparecer los demás; lo pendiente se cuenta para avisar.
 *  4. Riego y ambiente vuelven enseguida sin red, y lo anotado queda en el celular.
 *  5. La ficha de cosecha se guarda antes de marcar el cultivo como cosechado.
 */
import './helpers/setupDom';
import fs from 'fs';
import path from 'path';
import { cloudWrite, CLOUD_WRITE_FAILED_EVENT } from '../src/services/cloudWrite';
import { mergeCloudAndLocal } from '../src/services/dataSyncHelper';
import { localStore } from '../src/services/localStore';
import { wateringService } from '../src/services/wateringService';

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ [PASÓ] ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ [FALLÓ] ${name}: ${err?.message || err}`);
  }
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const read = (f: string) => fs.readFileSync(path.resolve(f), 'utf8');

async function run() {
  console.log('\n================================================================');
  console.log('   GUARDAR SIN CONEXIÓN');
  console.log('================================================================\n');

  await check('1. Escrituras: no frenan, y avisan si se rechazan', async () => {
    let saved = false;
    cloudWrite(() => new Promise(() => {}), () => (saved = true));
    assert(!saved, 'sin respuesta sigue adelante, sin marcarla guardada');
    await new Promise<void>((resolve) => cloudWrite(async () => {}, resolve));
    let code = '';
    const onFail = (e: any) => (code = e.detail.code);
    window.addEventListener(CLOUD_WRITE_FAILED_EVENT, onFail);
    const warn = console.warn;
    console.warn = () => {};
    cloudWrite(() => Promise.reject({ code: 'permission-denied' }));
    await new Promise((r) => setTimeout(r, 0));
    cloudWrite(() => {
      throw { code: 'invalid-argument' };
    });
    console.warn = warn;
    window.removeEventListener(CLOUD_WRITE_FAILED_EVENT, onFail);
    assert(code === 'invalid-argument', `avisó: ${code}`);
  });

  await check('2. Ningún servicio espera a la nube; la cola queda en el celular', () => {
    const dir = path.resolve('src/services');
    const waits = ['cultivation', 'diary', 'environment', 'genetics', 'harvest', 'indoor', 'photo', 'watering'].filter((n) => /await (setDoc|deleteDoc)\(/.test(read(path.join(dir, `${n}Service.ts`))));
    assert(waits.length === 0, `todavía esperan: ${waits}`);
    assert(/persistentLocalCache\(\{ tabManager: persistentMultipleTabManager\(\) \}\)/.test(read('src/firebase/config.ts')), 'caché persistente');
  });

  await check('3. Abrir sin conexión no hace desaparecer lo demás', () => {
    const local = [{ id: 'viejo' }, { id: 'pend', _isPendingLocal: true }];
    const cloud = [{ id: 'nuevo' }];
    const before = mergeCloudAndLocal(cloud, local, false).map((x) => x.id).join();
    assert(before === 'nuevo,viejo,pend', `antes de que responda el servidor: ${before}`);
    const after = mergeCloudAndLocal(cloud, local, true).map((x) => x.id).join();
    assert(after === 'nuevo,pend', `con el servidor manda la nube: ${after}`);
    localStore.saveAll('waterings', 'u-p', [{ id: 'a', userId: 'u-p', _isPendingLocal: true }, { id: 'b', userId: 'u-p' }] as any);
    assert(localStore.pendingCount('u-p') === 1, 'cuenta lo pendiente');
  });

  await check('4. Anotar un riego sin red vuelve enseguida y queda en el celular', async () => {
    const data: any = { userId: 'u-off', cultivationId: 'c1', date: '2026-11-07', time: '10:00', volumeLiters: 1 };
    const w: any = await Promise.race([wateringService.addWatering(data), new Promise((_, no) => setTimeout(() => no(new Error('se quedó esperando a la nube')), 1500))]);
    const items = localStore.getItems<any>('waterings', 'u-off');
    assert(items.some((x) => x.id === w.id), 'guardado local');
  });

  await check('5. La ficha de cosecha va antes que el cultivo', () => {
    const svc = read('src/services/harvestService.ts');
    const record = svc.slice(svc.indexOf('async recordHarvest'), svc.indexOf('async updateHarvest'));
    assert(record.indexOf('setDoc(') > 0 && record.indexOf('setDoc(') < record.indexOf('updateCultivation('), 'servicio');
    const modal = read('src/components/cultivations/FinalizeHarvestModal.tsx');
    assert(modal.indexOf('recordHarvest(') < modal.indexOf('updateCultivation('), 'ventana');
  });

  console.log('\n================================================================');
  console.log(` RESULTADO GUARDAR SIN CONEXIÓN: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en offline_saving:', err);
  process.exit(1);
});
