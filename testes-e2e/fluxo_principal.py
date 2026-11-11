"""Fluxo de ponta a ponta pela interface do TF Pipas 1.1 (Chrome headless).

Primeiro acesso (cria o administrador), produtos com preço por quantidade,
cadastro de funcionário, vendas (dinheiro, dividida com desconto, atacado),
cancelamento, sangria, financeiro (DRE, mês a mês, fluxo diário), produção,
relatórios, permissões do funcionário, senha errada, recuperação de senha
com o código e fechamento do caixa.

Uso: python3 fluxo_principal.py URL_BASE PASTA_FOTOS
Use sempre uma pasta de dados vazia (TFPIPAS_DADOS), nunca a da loja."""
import json, os, re, sys, urllib.error, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1].rstrip('/')
FOTOS = sys.argv[2]
erros = []
SENHA_ADMIN = '1234'
NOVA_SENHA_ADMIN = '9999'


def foto(pg, nome, inteira=False):
    if not inteira:
        pg.screenshot(path=f'{FOTOS}/{nome}.png')
        return
    # a rolagem é do <main>, não da página: aumenta a janela para caber tudo
    altura = pg.evaluate("Math.max(768, (document.querySelector('main')?.scrollHeight || 0) + 8)")
    pg.set_viewport_size({'width': 1366, 'height': min(altura, 5000)})
    pg.wait_for_timeout(300)
    pg.screenshot(path=f'{FOTOS}/{nome}.png')
    pg.set_viewport_size({'width': 1366, 'height': 768})
    pg.wait_for_timeout(150)


def cookie_de(ctx):
    for c in ctx.cookies():
        if c['name'] == 'tfpipas_sessao':
            return f"tfpipas_sessao={c['value']}"
    return ''


def api(caminho, metodo='GET', corpo=None, cookie=''):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    cab = {'content-type': 'application/json', 'x-tf-pipas': '1'}
    if cookie:
        cab['cookie'] = cookie
    req = urllib.request.Request(BASE + caminho, data=dados, method=metodo, headers=cab)
    try:
        r = urllib.request.urlopen(req)
        return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null')


def entrar_como(pg, nome, senha):
    pg.get_by_role('button', name=re.compile(nome)).first.click()
    pg.locator('#senha-entrar').fill(senha)
    pg.get_by_role('button', name='Entrar', exact=True).click()
    pg.wait_for_timeout(1400)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 1366, 'height': 768}, locale='pt-BR', timezone_id='America/Sao_Paulo')
    ctx.add_init_script("window.print = () => { window.__impressoes = (window.__impressoes||0) + 1; };")
    pg = ctx.new_page()
    pg.on('console', lambda m: erros.append(f'console.{m.type}: {m.text}') if m.type in ('error',) and 'status of 401' not in m.text else None)
    pg.on('pageerror', lambda e: erros.append(f'PAGEERROR: {e}'))
    pg.on('dialog', lambda d: (erros.append(f'DIALOGO NATIVO: {d.message}'), d.dismiss()))

    # 1. primeiro acesso: cria o administrador e mostra o código de recuperação
    pg.goto(BASE + '/')
    pg.wait_for_timeout(2500)
    foto(pg, '01-primeiro-acesso')
    expect(pg.get_by_role('heading', name=re.compile('Primeiro acesso'))).to_be_visible()
    st, r = api('/api/produtos')
    assert st == 401, ('sem login a API recusa', st)
    pg.locator('#pa-nome').fill('Eric')
    pg.locator('#pa-senha').fill('12')
    pg.locator('#pa-confirma').fill('12')
    pg.get_by_role('button', name=re.compile('Criar administrador')).click()
    expect(pg.get_by_text(re.compile('pelo menos 4 caracteres'))).to_be_visible()
    pg.locator('#pa-senha').fill(SENHA_ADMIN)
    pg.locator('#pa-confirma').fill(SENHA_ADMIN)
    pg.get_by_role('button', name=re.compile('Criar administrador')).click()
    pg.wait_for_timeout(1500)
    codigo = pg.get_by_test_id('codigo-recuperacao').inner_text().strip()
    print('código de recuperação mostrado:', re.sub(r'[A-Z0-9]', '•', codigo))
    assert re.fullmatch(r'[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){3}', codigo), codigo
    foto(pg, '02-codigo-recuperacao')
    botao_entrar = pg.get_by_role('button', name=re.compile('Entrar no sistema'))
    assert botao_entrar.is_disabled(), 'só entra depois de marcar que anotou'
    pg.get_by_role('checkbox').check()
    botao_entrar.click()
    pg.wait_for_timeout(1400)
    expect(pg.get_by_role('heading', level=1)).to_be_visible()
    foto(pg, '03-inicio-vazio')
    eric = cookie_de(ctx)
    assert eric, 'cookie de sessão'

    # 2. produtos (o primeiro com preço por quantidade e marcado como fabricado)
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
            dlg.get_by_role('button', name='Adicionar faixa').click()
            dlg.get_by_label('A partir de quantos').fill('1')
            dlg.get_by_label('Preço na faixa').fill('12,00')
            pg.get_by_role('button', name='Cadastrar produto').click()
            expect(dlg.get_by_text(re.compile('a faixa precisa começar acima de 1'))).to_be_visible()
            dlg.get_by_label('A partir de quantos').fill('10')
            dlg.get_by_role('switch', name=re.compile('A loja fabrica')).click()
            dlg.get_by_label('Lote de produção').fill('10')
            foto(pg, '04-produto-atacado-fabricado')
            pg.get_by_role('switch', name=re.compile('Cadastrar outro')).click()
        if i == 2:
            # "cadastrar outro" mantém categoria, unidade e "fabricado": a rabiola e a linha são compradas
            dlg.get_by_role('switch', name=re.compile('A loja fabrica')).click()
        if i == len(produtos) - 1:
            pg.get_by_role('switch', name=re.compile('Cadastrar outro')).click()
        pg.get_by_role('button', name='Cadastrar produto').click()
        pg.wait_for_timeout(600)
    pg.wait_for_timeout(500)
    foto(pg, '05-produtos-lista')
    linhas = pg.locator('table.tabela tbody tr').count()
    assert linhas == 4, linhas
    st, lista = api('/api/produtos', cookie=eric)
    raia = [x for x in lista if x['nome'] == 'Pipa raia 50 cm'][0]
    print('pipa raia: faixas', raia['precos_quantidade'], '| fabricado', raia['fabricado'], '| lote', raia['lote_producao'])
    assert raia['precos_quantidade'] == [{'quantidade': 10, 'preco_centavos': 1200}] and raia['fabricado'] and raia['lote_producao'] == 10
    fabricados = sorted(x['nome'] for x in lista if x['fabricado'])
    assert fabricados == ['Pipa raia 50 cm', 'Pipa reforçada'], fabricados
    assert all(x['precos_quantidade'] == [] for x in lista if x['nome'] != 'Pipa raia 50 cm'), 'faixas não passam para o próximo cadastro'

    # 3. cadastro de funcionário (só vende)
    pg.goto(BASE + '/#/configuracoes?secao=usuarios')
    pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Novo usuário').click()
    dlg = pg.get_by_role('dialog')
    dlg.get_by_label('Nome', exact=False).first.fill('Ana')
    dlg.locator('input[type=password]').nth(0).fill('4321')
    dlg.locator('input[type=password]').nth(1).fill('4321')
    foto(pg, '06-novo-usuario')
    dlg.get_by_role('button', name='Cadastrar usuário').click()
    pg.wait_for_timeout(900)
    foto(pg, '07-usuarios')
    texto_usuarios = pg.locator('table.tabela').inner_text()
    assert 'Ana' in texto_usuarios and 'Funcionário' in texto_usuarios, texto_usuarios

    # 4. frente de caixa: abrir caixa e vender
    pg.goto(BASE + '/#/pdv')
    pg.wait_for_timeout(900)
    foto(pg, '08-pdv-caixa-fechado')
    assert pg.get_by_label(re.compile('Operador')).count() == 0, 'operador agora vem do login'
    pg.get_by_label('Fundo de troco').fill('50,00')
    pg.get_by_role('button', name='Abrir caixa').click()
    pg.wait_for_timeout(900)
    busca = pg.get_by_label('Buscar produto')
    # venda 1: leitor de código de barras (2x pipa raia) + clique na rabiola
    busca.fill('2*7891234500011')
    busca.press('Enter')
    pg.get_by_role('button', name=re.compile('Rabiola 10 m')).click()
    pg.wait_for_timeout(300)
    dica = pg.get_by_text(re.compile('Com 10: R\\$ 12,00 cada'))
    expect(dica).to_be_visible()
    print('aviso de atacado no carrinho:', dica.inner_text())
    pg.keyboard.press('F8')
    pg.wait_for_timeout(200)
    pg.get_by_label(re.compile('Valor em Dinheiro')).fill('50,00')
    pg.wait_for_timeout(300)
    foto(pg, '09-pdv-venda-dinheiro')
    texto_troco = pg.get_by_text(re.compile('Troco: R\\$')).inner_text()
    assert 'R$ 13,00' in texto_troco, texto_troco
    pg.keyboard.press('F9')
    pg.wait_for_timeout(900)
    expect(pg.get_by_text(re.compile('Venda nº 1 concluída'))).to_be_visible()
    pg.get_by_role('button', name=re.compile('Nova venda')).click()
    pg.wait_for_timeout(400)

    # venda 2: PIX + dinheiro, com 10% de desconto
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
    botao = pg.get_by_role('button', name=re.compile('Concluir venda')).inner_text()
    assert 'R$ 30,60' in botao, botao
    expect(pg.get_by_text('Valores conferem')).to_be_visible()
    pg.get_by_role('button', name=re.compile('Concluir venda')).click()
    pg.wait_for_timeout(900)
    expect(pg.get_by_text(re.compile('Venda nº 2 concluída'))).to_be_visible()
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(500)

    # venda 3: 10 pipas raia saem pelo preço de atacado (R$ 12,00 cada)
    busca.fill('10*7891234500011')
    busca.press('Enter')
    pg.wait_for_timeout(300)
    expect(pg.get_by_text(re.compile('atacado 10\\+')).first).to_be_visible()
    foto(pg, '10-pdv-atacado')
    pg.get_by_role('button', name=re.compile('^PIX')).click()
    pg.wait_for_timeout(300)
    botao = pg.get_by_role('button', name=re.compile('Concluir venda')).inner_text()
    print('10 pipas com preço de atacado:', botao.replace('\n', ' '))
    assert 'R$ 120,00' in botao, botao
    pg.keyboard.press('F9')
    pg.wait_for_timeout(900)
    expect(pg.get_by_text(re.compile('Venda nº 3 concluída'))).to_be_visible()
    pg.keyboard.press('Enter')
    pg.wait_for_timeout(900)
    total_dia = pg.get_by_test_id('vendas-hoje').inner_text()
    print('vendas de hoje na frente de caixa:', total_dia)
    assert total_dia == 'R$ 187,60', total_dia  # 37,00 + 30,60 + 120,00
    st, v3 = api('/api/vendas/3', cookie=eric)
    assert v3['itens'][0]['preco_unitario_centavos'] == 1200 and v3['itens'][0]['preco_base_centavos'] == 1500, v3['itens']

    # 5. vendas: vendedor na lista e cancelamento da venda 2
    pg.goto(BASE + '/#/vendas')
    pg.wait_for_timeout(900)
    foto(pg, '11-vendas')
    assert 'Eric' in pg.locator('table.tabela').inner_text()
    pg.locator('table.tabela tbody tr').filter(has_text='PIX + Dinheiro').first.click()
    pg.wait_for_timeout(700)
    pg.get_by_role('button', name='Cancelar venda').click()
    pg.get_by_label('Motivo do cancelamento').fill('Cliente desistiu')
    pg.get_by_role('dialog').last.get_by_role('button', name='Cancelar venda').click()
    pg.wait_for_timeout(900)
    expect(pg.get_by_text(re.compile('Venda cancelada em .* por Eric'))).to_be_visible()
    foto(pg, '12-venda-cancelada')
    pg.keyboard.press('Escape')

    # 6. caixa: sangria
    pg.goto(BASE + '/#/caixa')
    pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Sangria').click()
    pg.get_by_role('dialog').get_by_label('Valor').fill('20,00')
    pg.get_by_role('dialog').get_by_label('Motivo').fill('Depósito no banco')
    pg.get_by_role('button', name='Registrar').click()
    pg.wait_for_timeout(900)
    foto(pg, '13-caixa')
    assert 'Eric' in pg.get_by_text(re.compile('Depósito no banco')).first.inner_text()

    # 7. financeiro: despesas, DRE com lucro líquido, mês a mês e fluxo diário
    pg.goto(BASE + '/#/financeiro')
    pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Nova despesa').click()
    pg.get_by_role('dialog').get_by_label('Descrição *').fill('Aluguel da loja')
    pg.get_by_role('dialog').get_by_label('Valor *').fill('800,00')
    pg.get_by_role('dialog').get_by_role('button', name='A pagar', exact=True).click()
    pg.get_by_label('Repetir todo mês').select_option('3')
    pg.get_by_role('dialog').get_by_role('button', name='Lançar', exact=True).click()
    pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Nova despesa').click()
    pg.get_by_role('dialog').get_by_label('Descrição *').fill('Conta de luz')
    pg.get_by_role('dialog').get_by_label('Valor *').fill('120,00')
    pg.get_by_role('dialog').get_by_role('button', name='Lançar', exact=True).click()
    pg.wait_for_timeout(900)
    pg.get_by_role('tab', name='DRE').click()
    pg.wait_for_timeout(900)
    lucro = pg.get_by_test_id('lucro-liquido').inner_text()
    st, res = api('/api/relatorios/resultado', cookie=eric)
    esperado = res['lucro_liquido_centavos']
    print('lucro líquido do período na tela:', lucro, '| servidor:', esperado)
    assert lucro.replace('−', '-').replace('R$', '').replace('\xa0', '').replace(' ', '').replace('.', '').replace(',', '') == str(esperado), (lucro, esperado)
    foto(pg, '14-dre', True)
    pg.get_by_role('tab', name='Mês a mês').click()
    pg.wait_for_timeout(1000)
    foto(pg, '15-dre-mes-a-mes', True)
    expect(pg.get_by_role('img', name=re.compile('Lucro líquido mês a mês'))).to_be_visible()
    pg.get_by_role('tab', name='Fluxo de caixa').click()
    pg.wait_for_timeout(1000)
    grafico = pg.get_by_role('img', name=re.compile('Saldo acumulado'))
    expect(grafico).to_be_visible()
    caixa_g = grafico.bounding_box()
    pg.mouse.move(caixa_g['x'] + caixa_g['width'] * 0.3, caixa_g['y'] + caixa_g['height'] * 0.5)
    pg.wait_for_timeout(300)
    foto(pg, '16-fluxo-diario', True)
    tabela_fluxo = pg.locator('table.tabela').first.inner_text()
    assert 'hoje' in tabela_fluxo, tabela_fluxo[:300]

    # 8. produção: sugestão a partir do ritmo de venda e registro de produção
    pg.goto(BASE + '/#/producao')
    pg.wait_for_timeout(1200)
    foto(pg, '17-producao', True)
    st, sug = api('/api/producao/sugestao', cookie=eric)
    item = [x for x in sug['itens'] if x['nome'] == 'Pipa raia 50 cm'][0]
    print('sugestão pipa raia: estoque', item['estoque'], '| vendido', item['vendido_periodo'], 'em', item['dias_considerados'], 'dia(s) | média', item['media_diaria'], '| meta', item['alvo'], '| sugestão', item['sugestao'])
    assert item['estoque'] == 28 and item['vendido_periodo'] == 12 and item['sugestao'] == 340, item  # 12/dia × 30 = 360 − 28 = 332 → lote de 10 → 340
    linha_raia = pg.locator('table.tabela tbody tr').filter(has_text='Pipa raia 50 cm')
    assert '340 un' in linha_raia.inner_text(), linha_raia.inner_text()
    linha_raia.get_by_role('checkbox').check()
    pg.get_by_role('button', name=re.compile('Registrar produção \\(1\\)')).click()
    dlg = pg.get_by_role('dialog')
    qtd = dlg.get_by_label('Quantidade produzida de Pipa raia 50 cm')
    assert qtd.input_value() == '340', qtd.input_value()
    qtd.fill('50')
    dlg.get_by_label('Custo por unidade de Pipa raia 50 cm').fill('5,00')
    foto(pg, '18-registrar-producao')
    dlg.get_by_role('button', name='Registrar produção', exact=True).click()
    pg.wait_for_timeout(1000)
    st, lista = api('/api/produtos', cookie=eric)
    raia = [x for x in lista if x['nome'] == 'Pipa raia 50 cm'][0]
    print('depois da produção: estoque', raia['estoque'], '| custo médio', raia['custo_centavos'])
    assert raia['estoque'] == 78 and raia['custo_centavos'] == round((28 * 600 + 50 * 500) / 78), raia
    pg.get_by_role('tab', name='Produções registradas').click()
    pg.wait_for_timeout(700)
    assert 'Eric' in pg.locator('table.tabela').inner_text()
    pg.get_by_role('tab', name='Produzir').click()
    pg.get_by_role('button', name=re.compile('Imprimir lista de produção')).click()
    pg.wait_for_timeout(400)
    assert 'LISTA DE PRODUÇÃO' in pg.locator('#impressao').inner_text()

    # 9. relatórios e início
    pg.goto(BASE + '/#/relatorios')
    pg.wait_for_timeout(1300)
    foto(pg, '19-relatorios', True)
    corpo = pg.locator('main').inner_text()
    assert 'Vendas por vendedor' in corpo and 'Curva' in corpo and 'Por categoria' in corpo
    pg.goto(BASE + '/#/inicio')
    pg.wait_for_timeout(1200)
    foto(pg, '20-inicio', True)
    expect(pg.get_by_text('Lucro líquido do mês')).to_be_visible()
    pg.goto(BASE + '/#/configuracoes?secao=backup')
    pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Fazer backup agora').click()
    pg.wait_for_timeout(900)

    # 10. sai e entra como funcionária: só vende, sem desconto, sem custo e sem financeiro
    pg.get_by_role('button', name='Sair').click()
    pg.wait_for_timeout(1500)
    foto(pg, '21-entrar-usuarios')
    expect(pg.get_by_role('heading', name='Quem vai usar o sistema?')).to_be_visible()
    assert pg.get_by_text('Sua sessão terminou').count() == 0, 'sair de propósito não é sessão vencida'
    entrar_como(pg, 'Ana', '4321')
    pg.goto(BASE + '/#/pdv')
    pg.wait_for_timeout(1000)
    menu = pg.locator('aside nav').inner_text()
    print('menu da funcionária:', ' | '.join(x for x in menu.split('\n') if x.strip()))
    assert 'Financeiro' not in menu and 'Relatórios' not in menu and 'Configurações' not in menu and 'Produtos' not in menu, menu
    expect(pg.get_by_text('seu usuário não lança desconto')).to_be_visible()
    busca = pg.get_by_label('Buscar produto')
    busca.fill('rabiola')
    busca.press('Enter')
    pg.keyboard.press('F8')
    pg.wait_for_timeout(300)
    foto(pg, '22-pdv-funcionaria')
    pg.keyboard.press('F9')
    pg.wait_for_timeout(900)
    expect(pg.get_by_text(re.compile('Venda nº 4 concluída'))).to_be_visible()
    pg.keyboard.press('Enter')
    ana = cookie_de(ctx)
    st, vendas_ana = api('/api/vendas', cookie=ana)
    assert st == 200 and all('lucro_bruto_centavos' not in v for v in vendas_ana), vendas_ana[:1]
    st, prods_ana = api('/api/produtos', cookie=ana)
    assert all('custo_centavos' not in x for x in prods_ana)
    st, _ = api('/api/financeiro/resumo', cookie=ana)
    assert st == 403, st
    st, _ = api('/api/usuarios', cookie=ana)
    assert st == 403, st
    pg.goto(BASE + '/#/financeiro')
    pg.wait_for_timeout(800)
    assert pg.locator('h1').first.inner_text().startswith('PDV'), 'sem permissão volta para a frente de caixa'
    pg.goto(BASE + '/#/vendas')
    pg.wait_for_timeout(800)
    pg.locator('table.tabela tbody tr').filter(has_text='Ana').first.click()
    pg.wait_for_timeout(700)
    assert pg.get_by_role('button', name='Cancelar venda').count() == 0
    assert 'Lucro bruto' not in pg.get_by_role('dialog').inner_text()
    foto(pg, '23-venda-funcionaria')
    pg.keyboard.press('Escape')
    st, v4 = api('/api/vendas/4', cookie=ana)  # a sessão do Eric terminou quando ele saiu
    assert v4['usuario_nome'] == 'Ana', v4['usuario_nome']

    # 11. senha errada
    pg.get_by_role('button', name='Sair').click()
    pg.wait_for_timeout(1500)
    entrar_como(pg, 'Ana', '0000')
    expect(pg.get_by_role('alert').filter(has_text='Senha errada')).to_be_visible()
    foto(pg, '24-senha-errada')

    # 12. administrador esqueceu a senha: usa o código de recuperação
    pg.get_by_role('button', name='Esqueci a senha').click()
    pg.wait_for_timeout(400)
    pg.locator('#rec-codigo').fill(codigo.replace('-', '').lower())
    assert pg.locator('#rec-codigo').input_value() == codigo, 'formata o código enquanto digita'
    pg.locator('#rec-nova').fill(NOVA_SENHA_ADMIN)
    pg.locator('#rec-confirma').fill(NOVA_SENHA_ADMIN)
    foto(pg, '25-recuperar')
    pg.get_by_role('button', name='Trocar a senha e entrar').click()
    pg.wait_for_timeout(1500)
    novo_codigo = pg.get_by_test_id('codigo-recuperacao').inner_text().strip()
    assert novo_codigo != codigo and re.fullmatch(r'[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){3}', novo_codigo)
    foto(pg, '26-novo-codigo')
    pg.get_by_role('checkbox').check()
    pg.get_by_role('button', name=re.compile('Entrar no sistema')).click()
    pg.wait_for_timeout(1400)
    eric = cookie_de(ctx)
    st, _ = api('/api/auth/entrar', 'POST', {'usuario_id': 1, 'senha': SENHA_ADMIN})
    assert st == 401, 'a senha antiga não vale mais'
    st, _ = api('/api/auth/recuperar', 'POST', {'usuario_id': 1, 'codigo': codigo, 'nova_senha': '5555'})
    assert st == 401, 'o código antigo não vale mais'

    # 13. fechar caixa: 50 + 37 + 10,60 − 10,60 (cancelada) − 20 (sangria) + 7 (Ana) = 74,00
    pg.goto(BASE + '/#/caixa')
    pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Fechar caixa').click()
    pg.get_by_label('Dinheiro contado na gaveta').fill('74,00')
    pg.wait_for_timeout(300)
    foto(pg, '27-fechar-caixa')
    dif = pg.get_by_role('dialog').inner_text()
    assert 'Bateu' in dif, dif
    pg.get_by_role('dialog').get_by_role('button', name='Fechar caixa').click()
    pg.wait_for_timeout(900)
    foto(pg, '28-caixa-fechado')
    b.close()

print('ERROS DO NAVEGADOR:' if erros else 'Sem erros no console.')
for e in erros:
    print(' ', e)
if erros:
    sys.exit(1)
