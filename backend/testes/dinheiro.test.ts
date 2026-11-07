import { describe, expect, test } from "bun:test";
import { calcularTaxa, custoMedio, margemBp, multiplicarDividir, ratear, reais, valorDaQuantidade } from "../src/dinheiro";
import { dataLocal, ehDataValida, somarDias, somarMeses } from "../src/relogio";

describe("multiplicarDividir", () => {
  test("arredonda meio centavo para cima", () => {
    expect(multiplicarDividir(1, 1, 2)).toBe(1);
    expect(multiplicarDividir(1, 1, 3)).toBe(0);
    expect(multiplicarDividir(2, 1, 3)).toBe(1);
    expect(multiplicarDividir(5, 1, 10)).toBe(1);
    expect(multiplicarDividir(4, 1, 10)).toBe(0);
  });

  test("não perde precisão com números grandes", () => {
    // 900 mil unidades (em milésimos) a R$ 99.999,99
    expect(multiplicarDividir(900_000_000, 9_999_999, 1000)).toBe(8_999_999_100_000);
  });

  test("recusa valores negativos e divisão por zero", () => {
    expect(() => multiplicarDividir(-1, 1, 1)).toThrow();
    expect(() => multiplicarDividir(1, 1, 0)).toThrow();
    expect(() => multiplicarDividir(1.5, 1, 1)).toThrow();
  });
});

describe("ratear", () => {
  test("divide sem sobrar nem faltar centavo", () => {
    expect(ratear(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(ratear(50, [1050, 1500])).toEqual([21, 29]);
    expect(ratear(0, [10, 20])).toEqual([0, 0]);
    expect(ratear(7, [0, 10, 0])).toEqual([0, 7, 0]);
  });

  test("propriedade: soma bate, nenhuma parte passa do peso, proporção certa (2.000 casos)", () => {
    let semente = 42;
    const aleatorio = (max: number) => {
      semente = (semente * 1103515245 + 12345) % 2 ** 31;
      return semente % max;
    };
    for (let caso = 0; caso < 2000; caso++) {
      const pesos = Array.from({ length: 1 + aleatorio(8) }, () => aleatorio(100_000));
      const soma = pesos.reduce((s, p) => s + p, 0);
      if (soma === 0) continue;
      const total = aleatorio(soma + 1);
      const partes = ratear(total, pesos);
      expect(partes.reduce((s, p) => s + p, 0)).toBe(total);
      partes.forEach((parte, i) => {
        expect(parte).toBeGreaterThanOrEqual(0);
        expect(parte).toBeLessThanOrEqual(pesos[i]!);
        expect(Math.abs(parte - (total * pesos[i]!) / soma)).toBeLessThan(1);
      });
    }
  });

  test("recusa dividir valor sem partes", () => {
    expect(() => ratear(10, [])).toThrow();
    expect(() => ratear(10, [0, 0])).toThrow();
  });
});

describe("taxas, margens e custos", () => {
  test("taxa da maquininha em pontos-base", () => {
    expect(calcularTaxa(10_000, 199)).toBe(199);
    expect(calcularTaxa(350, 499)).toBe(17); // 17,465 centavos
    expect(calcularTaxa(350, 0)).toBe(0);
  });

  test("margem sem receita é null (a tela mostra —)", () => {
    expect(margemBp(0, 0)).toBeNull();
    expect(margemBp(230, 350)).toBe(6571);
    expect(margemBp(-50, 100)).toBe(-5000);
  });

  test("valor de quantidade fracionada", () => {
    expect(valorDaQuantidade(2500, 100)).toBe(250); // 2,5 m a R$ 1,00
    expect(valorDaQuantidade(3000, 350)).toBe(1050);
    expect(valorDaQuantidade(333, 100)).toBe(33);
  });

  test("custo médio ponderado", () => {
    expect(custoMedio(10_000, 100, 10_000, 200)).toBe(150);
    expect(custoMedio(0, 100, 5_000, 180)).toBe(180);
    expect(custoMedio(-2_000, 100, 5_000, 180)).toBe(180);
    expect(custoMedio(3_000, 100, 1_000, 101)).toBe(100); // 100,25 arredonda para 100
  });

  test("formato de reais", () => {
    expect(reais(123456)).toBe("R$ 1.234,56");
    expect(reais(5)).toBe("R$ 0,05");
  });
});

describe("datas", () => {
  test("somar meses usa o último dia quando o mês é mais curto", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29");
    expect(somarMeses("2026-01-31", 2)).toBe("2026-03-31");
    expect(somarMeses("2026-12-15", 1)).toBe("2027-01-15");
    expect(somarMeses("2026-03-15", -3)).toBe("2025-12-15");
  });

  test("somar dias atravessa meses e anos", () => {
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  test("valida datas", () => {
    expect(ehDataValida("2026-02-28")).toBe(true);
    expect(ehDataValida("2026-02-30")).toBe(false);
    expect(ehDataValida("2026-1-01")).toBe(false);
    expect(ehDataValida("07/11/2026")).toBe(false);
  });

  test("dia da venda usa o fuso da loja (23h30 no Rio ainda é o mesmo dia)", () => {
    expect(dataLocal(new Date("2026-11-08T02:30:00Z"))).toBe("2026-11-07");
    expect(dataLocal(new Date("2026-11-08T03:30:00Z"))).toBe("2026-11-08");
  });
});
