import { rmSync } from 'node:fs';
if (process.env.DATABASE_URL) {
  console.error('Recusado: há uma DATABASE_URL definida (banco real). O reset só apaga o banco local.');
  process.exit(1);
}
rmSync(process.env.DB_PATH || 'data/pg', { recursive: true, force: true });
console.log('Banco local apagado. Será recriado com os dados iniciais ao subir o servidor.');
