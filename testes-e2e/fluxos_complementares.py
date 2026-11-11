"""Fluxos complementares: importar planilha, entrada de mercadoria, ajuste de estoque,
impressão do comprovante e restauração de backup. Uso: python3 e2e_extra.py URL PASTA"""
import os, re, sys, json, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1].rstrip('/')
FOTOS = sys.argv[2]
erros = []

def api(caminho, metodo='GET', corpo=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(BASE + caminho, data=dados, method=metodo, headers={'content-type': 'application/json', 'x-tf-pipas': '1'})
    return json.loads(urllib.request.urlopen(req).read() or b'null')

csv = 'nome;preço;custo;categoria;código de barras;estoque;estoque mínimo;unidade\n' \
      'Pipa estampada 40 cm;12,50;5,10;Pipas;7890000000017;30;5;un\n' \
      'Linha de pipa por metro;0,15;0,05;Linhas;;1000;100;m\n' \
      '"Carretilha ""profissional""";89,90;52,00;Acessórios;7890000000024;4;2;un\n' \
      ';10,00;;;;;;\n'
open('/tmp/produtos.csv', 'w', encoding='utf-8').write(csv)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
    ctx = b.new_context(viewport={'width': 1366, 'height': 768}, locale='pt-BR', timezone_id='America/Sao_Paulo', accept_downloads=True)
    ctx.add_init_script("sessionStorage.setItem('tfpipas.entrou','1'); window.print = () => { window.__impressoes = (window.__impressoes||0) + 1; };")
    pg = ctx.new_page()
    pg.on('console', lambda m: erros.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: erros.append(f'PAGEERROR: {e}'))

    # importar planilha
    pg.goto(BASE + '/#/produtos')
    pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Importar planilha').click()
    pg.get_by_role('dialog').locator('input[type=file]').set_input_files('/tmp/produtos.csv')
    pg.wait_for_timeout(500)
    pg.screenshot(path=f'{FOTOS}/30-importar-previa.png')
    pg.get_by_role('button', name=re.compile('Importar 4 produtos')).click()
    pg.wait_for_timeout(1500)
    resumo = pg.get_by_role('dialog').inner_text()
    print('importação:', ' | '.join(l for l in resumo.split('\n') if 'importad' in l or 'Linha' in l))
    assert '3 produtos importados' in resumo, resumo
    assert 'Linha 5: sem nome' in resumo, resumo
    pg.screenshot(path=f'{FOTOS}/31-importar-resultado.png')
    pg.get_by_role('button', name='Fechar', exact=True).first.click()
    produtos = api('/api/produtos')
    nomes = {x['nome']: x for x in produtos}
    assert 'Carretilha "profissional"' in nomes, list(nomes)
    assert nomes['Linha de pipa por metro']['unidade'] == 'm' and nomes['Linha de pipa por metro']['estoque'] == 1000
    print('produtos depois da importação:', len(produtos))

    # entrada de mercadoria (a pagar)
    pg.get_by_role('button', name='Entrada de mercadoria').click()
    dlg = pg.get_by_role('dialog')
    dlg.get_by_label('Fornecedor').fill('Distribuidora Vento Bom')
    busca = dlg.get_by_placeholder(re.compile('Buscar produto'))
    busca.fill('estampada')
    busca.press('Enter')
    pg.wait_for_timeout(200)
    linha = dlg.locator('table tbody tr').first
    linha.locator('input').first.fill('20')
    linha.locator('input').nth(1).fill('6,00')
    dlg.get_by_role('button', name=re.compile('A pagar')).click()
    dlg.locator('input[type=date]').fill('2026-12-10')
    pg.screenshot(path=f'{FOTOS}/32-entrada.png')
    pg.get_by_role('button', name='Registrar entrada').click()
    pg.wait_for_timeout(1000)
    est = [x for x in api('/api/produtos') if x['nome'] == 'Pipa estampada 40 cm'][0]
    print('pipa estampada: estoque', est['estoque'], 'custo médio', est['custo_centavos'])
    assert est['estoque'] == 50 and est['custo_centavos'] == round((30 * 510 + 20 * 600) / 50)
    pend = api('/api/financeiro/pendentes')
    assert any('Vento Bom' in l['descricao'] and l['valor_centavos'] == 12000 for l in pend['lancamentos']), pend

    # ajuste: perda de 2 unidades
    pg.goto(BASE + '/#/produtos')
    pg.wait_for_timeout(800)
    pg.locator('table.tabela tbody tr').filter(has_text='Pipa estampada').get_by_role('button', name='Ajustar estoque').click()
    dlg = pg.get_by_role('dialog')
    dlg.get_by_role('button', name=re.compile('^Perda')).click()
    dlg.get_by_label('Quantidade que saiu').fill('2')
    dlg.get_by_label('Observação').fill('rasgou na vitrine')
    pg.get_by_role('button', name='Registrar ajuste').click()
    pg.wait_for_timeout(900)
    est = [x for x in api('/api/produtos') if x['nome'] == 'Pipa estampada 40 cm'][0]
    assert est['estoque'] == 48, est
    pg.locator('table.tabela tbody tr').filter(has_text='Pipa estampada').get_by_role('button', name='Histórico').click()
    pg.wait_for_timeout(700)
    pg.screenshot(path=f'{FOTOS}/33-historico.png')
    pg.keyboard.press('Escape')

    # venda fracionada (linha por metro) e impressão do comprovante
    if not api('/api/caixa/atual')['caixa']:
        api('/api/caixa/abrir', 'POST', {'fundo_troco_centavos': 0, 'operador': 'Teste'})
    pg.goto(BASE + '/#/pdv')
    pg.wait_for_timeout(900)
    busca = pg.get_by_label('Buscar produto')
    busca.fill('2.5*7890000000017')
    busca.press('Enter')
    erro_frac = pg.get_by_role('alert').inner_text()
    print('quantidade quebrada em produto por unidade:', erro_frac)
    busca.fill('linha por metro')
    busca.press('Enter')
    pg.get_by_label('Quantidade').last.fill('12,5')
    pg.get_by_label('Quantidade').last.press('Enter')
    pg.get_by_role('button', name=re.compile('^PIX')).click()
    pg.wait_for_timeout(300)
    total = pg.get_by_role('button', name=re.compile('Concluir venda')).inner_text()
    print('12,5 m de linha a R$ 0,15:', total.replace('\n', ' '))
    assert 'R$ 1,88' in total, total  # 12,5 × 0,15 = 1,875 → 1,88 (meio centavo para cima, igual ao servidor)
    pg.keyboard.press('F9')
    pg.wait_for_timeout(900)
    pg.get_by_role('button', name=re.compile('Imprimir comprovante')).click()
    pg.wait_for_timeout(400)
    assert pg.evaluate('window.__impressoes') == 1
    pg.emulate_media(media='print')
    pg.screenshot(path=f'{FOTOS}/34-comprovante-impressao.png')
    texto = pg.locator('#impressao').inner_text()
    assert 'NÃO É DOCUMENTO FISCAL' in texto and '12,5 m x R$ 0,15' in texto, texto
    pg.emulate_media(media='screen')
    pg.keyboard.press('Enter')

    # backup manual e restauração (volta ao estado anterior à venda de linha)
    backups = api('/api/backups')['backups']
    alvo = [x for x in backups if x['motivo'] in ('automatico', 'manual')][0]
    vendas_antes = len(api('/api/vendas'))
    pg.goto(BASE + '/#/configuracoes?secao=backup')
    pg.wait_for_timeout(900)
    pg.locator('table.tabela tbody tr').filter(has_text=alvo['hora']).get_by_role('button', name='Restaurar').click()
    pg.get_by_role('dialog').get_by_role('button', name='Restaurar').click()
    pg.wait_for_timeout(1500)
    vendas_depois = len(api('/api/vendas'))
    print(f'restaurado {alvo["nome"]}: vendas {vendas_antes} → {vendas_depois}')
    pg.screenshot(path=f'{FOTOS}/35-restaurado.png')
    b.close()

print('ERROS DO NAVEGADOR:' if erros else 'Sem erros no console.')
for e in erros: print(' ', e)
