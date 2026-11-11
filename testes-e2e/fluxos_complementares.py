"""Fluxos complementares do TF Pipas 1.1 (rodar depois de fluxo_principal.py, na mesma pasta de dados):
importar planilha, entrada de mercadoria, ajuste de estoque, funcionária com permissões extras,
desativar usuário, venda fracionada com comprovante, sessão vencida, troca da própria senha
e restauração de backup (todo mundo entra de novo).

Uso: python3 fluxos_complementares.py URL PASTA_FOTOS   (SENHA_ADMIN=9999 por padrão)"""
import json, os, re, sys, urllib.error, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1].rstrip('/')
FOTOS = sys.argv[2]
SENHA_ADMIN = os.environ.get('SENHA_ADMIN', '9999')
erros = []


def api(caminho, metodo='GET', corpo=None, cookie=''):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    cab = {'content-type': 'application/json', 'x-tf-pipas': '1'}
    if cookie:
        cab['cookie'] = cookie
    req = urllib.request.Request(BASE + caminho, data=dados, method=metodo, headers=cab)
    try:
        r = urllib.request.urlopen(req)
        return r.status, json.loads(r.read() or b'null'), r.headers
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null'), e.headers


def login_api(nome, senha):
    _, estado, _ = api('/api/auth/estado')
    uid = [u['id'] for u in estado['usuarios'] if u['nome'] == nome][0]
    st, corpo, cab = api('/api/auth/entrar', 'POST', {'usuario_id': uid, 'senha': senha})
    assert st == 200, (st, corpo)
    valor = re.search(r'tfpipas_sessao=([^;]+)', cab.get('set-cookie', '')).group(1)
    return f'tfpipas_sessao={valor}', valor


def contexto(b, valor_cookie=None):
    ctx = b.new_context(viewport={'width': 1366, 'height': 768}, locale='pt-BR', timezone_id='America/Sao_Paulo', accept_downloads=True)
    ctx.add_init_script("sessionStorage.setItem('tfpipas.entrou','1'); window.print = () => { window.__impressoes = (window.__impressoes||0) + 1; };")
    if valor_cookie:
        ctx.add_cookies([{'name': 'tfpipas_sessao', 'value': valor_cookie, 'url': BASE}])
    pg = ctx.new_page()
    pg.on('console', lambda m: erros.append(f'console.{m.type}: {m.text}') if m.type == 'error' and 'status of 401' not in m.text else None)
    pg.on('pageerror', lambda e: erros.append(f'PAGEERROR: {e}'))
    return ctx, pg


def cookie_de(ctx):
    for c in ctx.cookies():
        if c['name'] == 'tfpipas_sessao':
            return f"tfpipas_sessao={c['value']}"
    return ''


csv = 'nome;preço;custo;categoria;código de barras;estoque;estoque mínimo;unidade\n' \
      'Pipa estampada 40 cm;12,50;5,10;Pipas;7890000000017;30;5;un\n' \
      'Linha de pipa por metro;0,15;0,05;Linhas;;1000;100;m\n' \
      '"Carretilha ""profissional""";89,90;52,00;Acessórios;7890000000024;4;2;un\n' \
      ';10,00;;;;;;\n'
open('/tmp/produtos.csv', 'w', encoding='utf-8').write(csv)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
    eric, valor = login_api('Eric', SENHA_ADMIN)
    ctx, pg = contexto(b, valor)

    # importar planilha
    pg.goto(BASE + '/#/produtos')
    pg.wait_for_timeout(1000)
    pg.get_by_role('button', name='Importar planilha').click()
    pg.get_by_role('dialog').locator('input[type=file]').set_input_files('/tmp/produtos.csv')
    pg.wait_for_timeout(500)
    pg.screenshot(path=f'{FOTOS}/30-importar-previa.png')
    pg.get_by_role('button', name=re.compile('Importar 4 produtos')).click()
    pg.wait_for_timeout(1500)
    resumo = pg.get_by_role('dialog').inner_text()
    assert '3 produtos importados' in resumo and 'Linha 5: sem nome' in resumo, resumo
    pg.get_by_role('button', name='Fechar', exact=True).first.click()
    _, produtos, _ = api('/api/produtos', cookie=eric)
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
    pg.get_by_role('button', name='Registrar entrada').click()
    pg.wait_for_timeout(1000)
    est = [x for x in api('/api/produtos', cookie=eric)[1] if x['nome'] == 'Pipa estampada 40 cm'][0]
    print('pipa estampada: estoque', est['estoque'], '| custo médio', est['custo_centavos'])
    assert est['estoque'] == 50 and est['custo_centavos'] == round((30 * 510 + 20 * 600) / 50)
    pend = api('/api/financeiro/pendentes', cookie=eric)[1]
    assert any('Vento Bom' in l['descricao'] and l['valor_centavos'] == 12000 for l in pend['lancamentos']), pend
    pg.get_by_role('tab', name=re.compile('Entradas')).click()
    pg.wait_for_timeout(700)
    tabela = pg.locator('table.tabela').inner_text()
    assert 'Compra' in tabela and 'Produção' in tabela and 'Eric' in tabela, tabela
    pg.screenshot(path=f'{FOTOS}/31-entradas-compra-producao.png')

    # ajuste: perda de 2 unidades; filtro "Acabando"
    pg.get_by_role('tab', name='Produtos').click()
    pg.wait_for_timeout(600)
    pg.locator('table.tabela tbody tr').filter(has_text='Pipa estampada').get_by_role('button', name='Ajustar estoque').click()
    dlg = pg.get_by_role('dialog')
    dlg.get_by_role('button', name=re.compile('^Perda')).click()
    dlg.get_by_label('Quantidade que saiu').fill('2')
    dlg.get_by_label('Observação').fill('rasgou na vitrine')
    pg.get_by_role('button', name='Registrar ajuste').click()
    pg.wait_for_timeout(900)
    est = [x for x in api('/api/produtos', cookie=eric)[1] if x['nome'] == 'Pipa estampada 40 cm'][0]
    assert est['estoque'] == 48, est
    pg.get_by_role('button', name=re.compile('^Acabando')).click()
    pg.wait_for_timeout(400)
    pg.screenshot(path=f'{FOTOS}/32-acabando.png')
    acabando = pg.locator('table.tabela tbody').inner_text()
    print('filtro acabando:', ' | '.join(l for l in acabando.split('\n') if l.strip() and 'R$' not in l)[:200])
    # pipa raia: 78 un e vendeu 12 hoje → dura ~6 dias (< 7); carretilha: 4 com mínimo 2 → ainda não
    assert 'Pipa raia 50 cm' in acabando and 'Carretilha' not in acabando, acabando
    pg.get_by_role('button', name=re.compile('^Acabando')).click()

    # funcionária com permissões extras (desconto + produtos), depois desativada
    st, bia, _ = api('/api/usuarios', 'POST', {'nome': 'Bia', 'perfil': 'funcionario', 'permissoes': ['desconto', 'produtos'], 'senha': '2468'}, cookie=eric)
    assert st == 200, bia
    bia_cookie, bia_valor = login_api('Bia', '2468')
    ctx_bia, pg_bia = contexto(b, bia_valor)
    pg_bia.goto(BASE + '/#/pdv')
    pg_bia.wait_for_timeout(1200)
    menu = pg_bia.locator('aside nav').inner_text()
    assert 'Produtos e estoque' in menu and 'Produção' in menu and 'Financeiro' not in menu and 'Configurações' not in menu, menu
    expect(pg_bia.get_by_label('Desconto')).to_be_visible()
    st, prods, _ = api('/api/produtos', cookie=bia_cookie)
    assert 'custo_centavos' in prods[0], 'com permissão de produtos, vê o custo'
    st, _, _ = api('/api/relatorios/estoque', cookie=bia_cookie)
    assert st == 200
    st, _, _ = api('/api/relatorios/resultado', cookie=bia_cookie)
    assert st == 403
    pg_bia.screenshot(path=f'{FOTOS}/33-funcionaria-com-desconto.png')
    st, _, _ = api(f"/api/usuarios/{bia['id']}", 'PUT', {'ativo': False}, cookie=eric)
    assert st == 200
    pg_bia.goto(BASE + '/#/vendas')
    pg_bia.wait_for_timeout(1500)
    expect(pg_bia.get_by_text('Sua sessão terminou. Entre de novo para continuar.')).to_be_visible()
    assert pg_bia.get_by_role('button', name=re.compile('Bia')).count() == 0, 'desativada não aparece para entrar'
    pg_bia.screenshot(path=f'{FOTOS}/34-desativada-saiu.png')
    ctx_bia.close()

    # venda fracionada (linha por metro) e comprovante com o nome de quem vendeu
    if not api('/api/caixa/atual', cookie=eric)[1]['caixa']:
        api('/api/caixa/abrir', 'POST', {'fundo_troco_centavos': 0}, cookie=eric)
    pg.goto(BASE + '/#/pdv')
    pg.wait_for_timeout(900)
    busca = pg.get_by_label('Buscar produto')
    busca.fill('2.5*7890000000017')
    busca.press('Enter')
    print('quantidade quebrada em produto por unidade:', pg.get_by_role('alert').inner_text())
    busca.fill('linha por metro')
    busca.press('Enter')
    pg.get_by_label('Quantidade').last.fill('12,5')
    pg.get_by_label('Quantidade').last.press('Enter')
    pg.get_by_role('button', name=re.compile('^PIX')).click()
    pg.wait_for_timeout(300)
    total = pg.get_by_role('button', name=re.compile('Concluir venda')).inner_text()
    assert 'R$ 1,88' in total, total  # 12,5 × 0,15 = 1,875 → 1,88 (meio centavo para cima, igual ao servidor)
    pg.keyboard.press('F9')
    pg.wait_for_timeout(900)
    pg.get_by_role('button', name=re.compile('Imprimir comprovante')).click()
    pg.wait_for_timeout(400)
    assert pg.evaluate('window.__impressoes') == 1
    pg.emulate_media(media='print')
    pg.screenshot(path=f'{FOTOS}/35-comprovante-impressao.png')
    texto = pg.locator('#impressao').inner_text()
    assert 'NÃO É DOCUMENTO FISCAL' in texto and '12,5 m x R$ 0,15' in texto and 'Atendido por: Eric' in texto, texto
    pg.emulate_media(media='screen')
    pg.keyboard.press('Enter')

    # sessão vencida: o cookie some e a próxima tela volta para a entrada com aviso
    ctx.clear_cookies()
    pg.goto(BASE + '/#/vendas')
    pg.wait_for_timeout(1500)
    expect(pg.get_by_text('Sua sessão terminou. Entre de novo para continuar.')).to_be_visible()
    pg.get_by_role('button', name=re.compile('Eric')).first.click()
    pg.locator('#senha-entrar').fill(SENHA_ADMIN)
    pg.get_by_role('button', name='Entrar', exact=True).click()
    pg.wait_for_timeout(1500)
    expect(pg.get_by_role('heading', level=1)).to_be_visible()
    eric = cookie_de(ctx)

    # trocar a própria senha (ícone da chave no menu)
    pg.get_by_role('button', name='Trocar minha senha').click()
    dlg = pg.get_by_role('dialog')
    senhas = dlg.locator('input[type=password]')
    senhas.nth(0).fill('errada')
    senhas.nth(1).fill('8888')
    senhas.nth(2).fill('8888')
    dlg.get_by_role('button', name='Trocar senha').click()
    expect(dlg.get_by_text('A senha atual está errada.')).to_be_visible()
    senhas.nth(0).fill(SENHA_ADMIN)
    dlg.get_by_role('button', name='Trocar senha').click()
    pg.wait_for_timeout(900)
    assert api('/api/auth/estado', cookie=eric)[1]['usuario']['nome'] == 'Eric', 'quem troca a senha continua logado'
    st, _, _ = api('/api/auth/entrar', 'POST', {'usuario_id': 1, 'senha': SENHA_ADMIN})
    assert st == 401
    eric, _ = login_api('Eric', '8888')
    print('senha do Eric trocada pela tela (agora 8888)')

    # backup manual, uma venda depois dele, e restauração: a venda some e todos entram de novo
    st, bk, _ = api('/api/backups', 'POST', cookie=eric)
    assert st == 200, bk
    _, formas, _ = api('/api/formas-pagamento', cookie=eric)
    pix = [f for f in formas if f['nome'] == 'PIX'][0]
    estampada = [x for x in api('/api/produtos', cookie=eric)[1] if x['nome'] == 'Pipa estampada 40 cm'][0]
    st, venda, _ = api('/api/vendas', 'POST', {'itens': [{'produto_id': estampada['id'], 'quantidade': 1}], 'pagamentos': [{'forma_id': pix['id'], 'valor_centavos': 1250}]}, cookie=eric)
    assert st == 200, venda
    vendas_antes = len(api('/api/vendas', cookie=eric)[1])
    pg.goto(BASE + '/#/configuracoes?secao=backup')
    pg.wait_for_timeout(1000)
    pg.locator('table.tabela tbody tr').filter(has=pg.locator(f'a[download="{bk["nome"]}"]')).get_by_role('button', name='Restaurar').click()
    pg.get_by_role('dialog').get_by_role('button', name='Restaurar').click()
    pg.wait_for_timeout(2000)
    pg.screenshot(path=f'{FOTOS}/36-restaurado-entrar-de-novo.png')
    expect(pg.get_by_text(re.compile('Backup restaurado .* Entre de novo com o seu usuário'))).to_be_visible()
    st, _, _ = api('/api/vendas', cookie=eric)
    assert st == 401, 'a restauração encerra todas as sessões'
    pg.get_by_role('button', name=re.compile('Eric')).first.click()
    pg.locator('#senha-entrar').fill('8888')
    pg.get_by_role('button', name='Entrar', exact=True).click()
    pg.wait_for_timeout(1500)
    eric = cookie_de(ctx)
    vendas_depois = len(api('/api/vendas', cookie=eric)[1])
    print(f'restaurado {bk["nome"]}: vendas {vendas_antes} → {vendas_depois}')
    assert vendas_depois == vendas_antes - 1
    b.close()

print('ERROS DO NAVEGADOR:' if erros else 'Sem erros no console.')
for e in erros:
    print(' ', e)
if erros:
    sys.exit(1)
