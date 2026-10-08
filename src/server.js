import { app } from './app.js';

const porta = process.env.PORT || 3000;
export const servidor = app.listen(porta, () => console.log(`Controle Financeiro OnTrade em http://localhost:${porta}`));
