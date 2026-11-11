// Carregado antes de todos os testes (bunfig.toml).
// Fuso do Rio de Janeiro, para "hoje" e "este mês" darem sempre o mesmo resultado.
process.env.TZ = "America/Sao_Paulo";

import { afterEach } from "bun:test";
import { restaurarRelogio } from "../src/relogio";

// Todo teste termina com o relógio de verdade (um teste não contamina o outro).
afterEach(() => restaurarRelogio());
