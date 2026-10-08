import { rmSync } from 'node:fs';
rmSync(process.env.DB_PATH || 'data/caixa.db', { force: true });
rmSync((process.env.DB_PATH || 'data/caixa.db') + '-wal', { force: true });
rmSync((process.env.DB_PATH || 'data/caixa.db') + '-shm', { force: true });
console.log('Banco apagado. Será recriado com os dados iniciais ao subir o servidor.');
