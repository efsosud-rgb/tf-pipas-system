"""Fluxo de ponta a ponta pela interface do TF Pipas (Chrome headless).
Uso: python3 e2e.py URL_BASE PASTA_FOTOS"""
import os, re, sys, json
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1].rstrip('/')
FOTOS = sys.argv[2]
erros = []

def foto(pg, nome):
    pg.screenshot(path=f'{FOTOS}/{nome}.png', full_page=False)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 1366, 'height': 768}, locale='pt-BR', timezone_id='America/Sao_Paulo')
    pg = ctx.new_page()
    pg.on('console', lambda m: erros.append(f'console.{m.type}: {m.text}') if m.type in ('error',) else None)
    pg.on('pageerror', lambda e: erros.append(f'PAGEERROR: {e}'))
    pg.on('dialog', lambda d: (erros.append(f'DIALOGO NATIVO: {d.message}'), d.dismiss()))

    # 1. capa
    pg.goto(BASE + '/')
    pg.wait_for_timeout(2500)
    foto(pg, '01-capa')
    expect(pg.get_by_role('button', name=re.compile('Entrar no sistema'))).to_be_visible()
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(1200)
    expect(pg.get_by_role('heading', level=1)).to_be_visible()
    foto(pg, '02-inicio-vazio')

    # 2. produtos
    pg.goto(BASE + '/#/produtos')
    pg.wait_for_timeout(800)
    produtos = [
        ('Pipa raia 50 cm', 'Pipas', '15,00', '6,00', '40', '7891234500011'),
        ('Pipa reforçada', 'Pipas', '22,00', '9,50', '25', '7891234500028'),
        ('Rabiola 10 m', 'Acessórios', '7,00', '2,20', '60', ''),
        ('Linha 10 (carretel 500 m)', 'Linhas', '12,00', '5,40', '30', '7891234500042'),
    ]
    for i, (nome, cat, preco, custo, est, ean) in enumerate(produtos):
        if i == 0:
            pg.get_by_role('button', name='Novo produto').click()
        dlg = pg.get_by_role('dialog')
        dlg.get_by_label('Nome *').fill(nome)
        dlg.get_by_label('Categoria').fill(cat)
        dlg.get_by_label('Preço de venda *').fill(preco)
        dlg.get_by_label('Preço de custo').fill(custo)
        dlg.get_by_label('Estoque inicial').fill(est)
        if ean:
            dlg.get_by_label('Código de barras').fill(ean)
        if i == 0:
            pg.get_by_role('switch', name=re.compile('Cadastrar outro')).click()
        if i == 1:
            foto(pg, '03-produto-form')
        if i == len(produtos) - 1:
            pg.get_by_role('switch', name=re.compile('Cadastrar outro')).click()
        pg.get_by_role('button', name='Cadastrar produto').click()
        pg.wait_for_timeout(600)
    pg.wait_for_timeout(500)
    foto(pg, '04-produtos-lista')
    linhas = pg.locator('table.tabela tbody tr').count()
    print('produtos na tabela:', linhas)
    assert linhas == 4, linhas

    # 3. frente de caixa: abrir caixa e vender
    pg.goto(BASE + '/#/pdv')
    pg.wait_for_timeout(900)
    foto(pg, '05-pdv-caixa-fechado')
    pg.get_by_label('Fundo de troco').fill('50,00')
    pg.get_by_label('Operador (opcional)').fill('Thiago')
    pg.get_by_role('button', name='Abrir caixa').click()
    pg.wait_for_timeout(900)
    # venda 1: leitor de código de barras (2x pipa raia) + clique na rabiola
    busca = pg.get_by_label('Buscar produto')
    busca.fill('2*7891234500011')
    busca.press('Enter')
    pg.get_by_role('button', name=re.compile('Rabiola 10 m')).click()
    pg.wait_for_timeout(300)
    pg.keyboard.press('F8')  # dinheiro
    pg.wait_for_timeout(200)
    campo_receb = pg.get_by_label(re.compile('Valor em Dinheiro'))
    campo_receb.fill('50,00')
    pg.wait_for_timeout(300)
    foto(pg, '06-pdv-venda-dinheiro')
    texto_troco = pg.get_by_text(re.compile('Troco: R\\$')).inner_text()
    print('troco na tela:', texto_troco)
    assert 'R$ 13,00' in texto_troco, texto_troco
    pg.keyboard.press('F9')
    pg.wait_for_timeout(900)
    foto(pg, '07-venda-concluida')
    expect(pg.get_by_text(re.compile('Venda nº 1 concluída'))).to_be_visible()
    pg.get_by_role('button', name=re.compile('Nova venda')).click()
    pg.wait_for_timeout(400)

    # venda 2: pagamento dividido PIX + dinheiro, com 10% de desconto
    busca.fill('pipa reforçada')
    busca.press('Enter')
    busca.fill('linha')
    busca.press('Enter')
    pg.get_by_role('button', name='%').click()
    pg.get_by_label('Desconto').fill('10')
    pg.get_by_role('button', name=re.compile('^PIX')).click()
    pg.get_by_label(re.compile('Valor em PIX')).fill('20,00')
    pg.get_by_role('button', name=re.compile('^Dinheiro')).click()
    pg.wait_for_timeout(300)
    foto(pg, '08-pdv-dividido')
    botao = pg.get_by_role('button', name=re.compile('Concluir venda')).inner_text()
    print('botão concluir (venda 2):', botao.replace('\n', ' '))
    assert 'R$ 30,60' in botao, botao
    expect(pg.get_by_text('Valores conferem')).to_be_visible()
    pg.get_by_role('button', name=re.compile('Concluir venda')).click()
    pg.wait_for_timeout(900)
    expect(pg.get_by_text(re.compile('Venda nº 2 concluída'))).to_be_visible()
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(500)

    # 4. vendas: detalhe e cancelamento da venda 2
    pg.goto(BASE + '/#/vendas')
    pg.wait_for_timeout(900)
    foto(pg, '09-vendas')
    pg.locator('table.tabela tbody tr').filter(has_text='PIX').first.click()
    pg.wait_for_timeout(700)
    foto(pg, '10-venda-detalhe')
    pg.get_by_role('button', name='Cancelar venda').click()
    pg.get_by_label('Motivo do cancelamento').fill('Cliente desistiu')
    pg.get_by_role('dialog').last.get_by_role('button', name='Cancelar venda').click()
    pg.wait_for_timeout(900)
    expect(pg.get_by_text(re.compile('Venda cancelada em'))).to_be_visible()
    pg.keyboard.press('Escape')

    # 5. caixa: sangria
    pg.goto(BASE + '/#/caixa')
    pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Sangria').click()
    pg.get_by_role('dialog').get_by_label('Valor').fill('20,00')
    pg.get_by_role('dialog').get_by_label('Motivo').fill('Depósito no banco')
    pg.get_by_role('button', name='Registrar').click()
    pg.wait_for_timeout(900)
    foto(pg, '11-caixa')

    # 6. financeiro: despesa a pagar mensal + DRE
    pg.goto(BASE + '/#/financeiro')
    pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Nova despesa').click()
    pg.get_by_role('dialog').get_by_label('Descrição *').fill('Aluguel da loja')
    pg.get_by_role('dialog').get_by_label('Valor *').fill('800,00')
    pg.get_by_role('dialog').get_by_role('button', name='A pagar', exact=True).click()
    pg.get_by_label('Repetir todo mês').select_option('3')
    foto(pg, '12-despesa-form')
    pg.get_by_role('dialog').get_by_role('button', name='Lançar', exact=True).click()
    pg.wait_for_timeout(900)
    foto(pg, '13-contas-a-pagar')
    pg.get_by_role('button', name='Nova despesa').click()
    pg.get_by_role('dialog').get_by_label('Descrição *').fill('Conta de luz')
    pg.get_by_role('dialog').get_by_label('Valor *').fill('120,00')
    pg.get_by_role('dialog').get_by_role('button', name='Lançar', exact=True).click()
    pg.wait_for_timeout(900)
    pg.get_by_role('tab', name='DRE').click()
    pg.wait_for_timeout(900)
    foto(pg, '14-dre')
    pg.get_by_role('tab', name='Fluxo de caixa').click()
    pg.wait_for_timeout(800)
    foto(pg, '15-fluxo')

    # 7. relatórios, início, configurações
    pg.goto(BASE + '/#/relatorios')
    pg.wait_for_timeout(1200)
    foto(pg, '16-relatorios')
    pg.goto(BASE + '/#/inicio')
    pg.wait_for_timeout(1200)
    foto(pg, '17-inicio')
    pg.goto(BASE + '/#/configuracoes')
    pg.wait_for_timeout(900)
    foto(pg, '18-config')
    pg.get_by_role('tab', name='Cópias de segurança').click()
    pg.get_by_role('button', name='Fazer backup agora').click()
    pg.wait_for_timeout(900)
    foto(pg, '19-backups')

    # 8. fechar caixa
    pg.goto(BASE + '/#/caixa')
    pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Fechar caixa').click()
    pg.get_by_label('Dinheiro contado na gaveta').fill('67,00')
    pg.wait_for_timeout(300)
    foto(pg, '20-fechar-caixa')
    pg.get_by_role('dialog').get_by_role('button', name='Fechar caixa').click()
    pg.wait_for_timeout(900)
    foto(pg, '21-caixa-fechado')
    b.close()

print('ERROS DO NAVEGADOR:' if erros else 'Sem erros no console.')
for e in erros: print(' ', e)
