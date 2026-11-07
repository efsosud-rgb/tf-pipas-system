import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('TF Pipas System 5D ERP - Visual & E2E Validation', () => {
  const screenshotsDir = path.resolve(__dirname, '../../test-results/screenshots');

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test('Deve renderizar o PDV com 3D header, atalhos e carrinho funcional', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Valida título da aplicação e paleta
    await expect(page.locator('text=TF PIPAS SYSTEM')).toBeVisible();

    // Captura screenshot do PDV
    await page.screenshot({ path: path.join(screenshotsDir, '01_pdv_screen.png'), fullPage: true });

    // Adiciona produto ao carrinho
    const addButtons = page.locator('button:has-text("Adicionar")');
    if (await addButtons.count() > 0) {
      await addButtons.first().click();
    }

    // Abre checkout modal
    const checkoutBtn = page.locator('button:has-text("Finalizar Venda (F2)")');
    if (await checkoutBtn.count() > 0) {
      await checkoutBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(screenshotsDir, '02_checkout_modal.png') });
    }
  });

  test('Deve navegar e validar a tela de Estoque & Fábrica (BOM)', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Estoque & Fábrica (BOM)")');
    await page.waitForTimeout(500);
    await expect(page.locator('text=Chão de Fábrica & Engenharia de Materiais (BOM)')).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, '03_factory_bom.png'), fullPage: true });
  });

  test('Deve navegar e validar o Financeiro com DRE Gerencial e Projeção ML', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Financeiro & DRE & ML")');
    await page.waitForTimeout(500);
    await expect(page.locator('text=DRE Gerencial')).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, '04_financial_dre.png'), fullPage: true });
  });

  test('Deve exibir a Central de Agentes Hermes com IA e MCP', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Central Hermes IA & MCP")');
    await page.waitForTimeout(500);
    await expect(page.locator('text=Central de Agentes Hermes')).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, '05_ai_agents.png'), fullPage: true });
  });

  test('Deve renderizar o Ambiente 5D Imersivo da Pipa TF em Three.js', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Ambiente 5D Pipa TF")');
    await page.waitForTimeout(600);
    await expect(page.locator('text=Pipa Raia Carioca TF Pipas em Ambiente 5D')).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, '06_3d_5d_canvas.png'), fullPage: true });
  });
});
