import { DatabaseBackup, Download, FolderOpen, HardDriveUpload, KeyRound, Pencil, Plus, Power, Printer, RotateCcw, Save, ShieldCheck, UserPlus } from "lucide-react";
import { useState } from "react";
import { api, ErroApi, mensagemDeErro } from "../api";
import { carregarEstado, sair, useUsuario } from "../auth";
import { imprimirNoPapel } from "../componentes/comprovante";
import { avisar, confirmar } from "../componentes/avisos";
import { Abas, AvisoErro, Botao, Campo, CampoSenha, Cabecalho, Carregando, Cartao, cx, Entrada, Etiqueta, Interruptor, Modal, Selecao, Vazio } from "../componentes/ui";
import { bpParaTexto, data, dataHora, tamanhoArquivo, textoParaBp } from "../formato";
import { avisarMudanca, useApi } from "../hooks";
import { parametrosDaRota } from "../rotas";
import type { Categoria, Config, FormaPagamento, InfoBackup, Perfil, Permissao, Saude, TipoLancamento, Usuario } from "../tipos";
import { FolhaCodigo } from "./Capa";

type Secao = "loja" | "usuarios" | "formas" | "categorias" | "backup" | "sistema";

export default function Configuracoes() {
  const [secao, setSecao] = useState<Secao>(() => {
    const s = parametrosDaRota().get("secao") as Secao | null;
    return s && ["loja", "usuarios", "formas", "categorias", "backup", "sistema"].includes(s) ? s : "loja";
  });
  return (
    <div className="flex flex-col gap-5">
      <Cabecalho rotulo="Ajustes" titulo="Configurações" descricao="Dados da loja, usuários, taxas das maquininhas, categorias do financeiro, cópias de segurança e o programa." />
      <Abas
        abas={[
          { id: "loja", rotulo: "Loja e comprovante" },
          { id: "usuarios", rotulo: "Usuários" },
          { id: "formas", rotulo: "Formas de pagamento" },
          { id: "categorias", rotulo: "Categorias do financeiro" },
          { id: "backup", rotulo: "Cópias de segurança" },
          { id: "sistema", rotulo: "Sistema" },
        ]}
        ativa={secao}
        aoMudar={setSecao}
      />
      {secao === "loja" && <SecaoLoja />}
      {secao === "usuarios" && <SecaoUsuarios />}
      {secao === "formas" && <SecaoFormas />}
      {secao === "categorias" && <SecaoCategorias />}
      {secao === "backup" && <SecaoBackup />}
      {secao === "sistema" && <SecaoSistema />}
    </div>
  );
}

function SecaoLoja() {
  const config = useApi<Config>("/api/config");
  const [rascunho, setF] = useState<Config | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const f = rascunho ?? config.dados;
  if (!f) return config.erro ? <AvisoErro mensagem={config.erro} /> : <Carregando />;
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const novo = await api.put<Config>("/api/config", f);
      setF(novo);
      avisar("Configurações salvas.");
      avisarMudanca();
    } catch (er) {
      setErro(mensagemDeErro(er));
    } finally {
      setEnviando(false);
    }
  }
  const campo = (chave: keyof Config, rotulo: string, extra: { placeholder?: string; max?: number; dica?: string } = {}) => (
    <Campo rotulo={rotulo} dica={extra.dica}>
      <Entrada value={String(f[chave] ?? "")} maxLength={extra.max ?? 80} placeholder={extra.placeholder} onChange={(e) => setF({ ...f, [chave]: e.target.value })} />
    </Campo>
  );
  return (
    <form onSubmit={salvar} className="grid gap-4 xl:grid-cols-2">
      <Cartao rotulo="Identificação" titulo="Dados da loja">
        <div className="grid gap-4 md:grid-cols-2">
          {campo("loja_nome", "Nome da loja")}
          {campo("loja_documento", "CNPJ ou CPF", { placeholder: "Sai no comprovante", max: 30 })}
          {campo("loja_telefone", "Telefone / WhatsApp", { max: 40 })}
          {campo("loja_instagram", "Instagram", { max: 60 })}
          <div className="md:col-span-2">{campo("loja_endereco", "Endereço", { max: 160 })}</div>
        </div>
      </Cartao>
      <Cartao rotulo="Impressão" titulo="Comprovante de venda">
        <div className="grid gap-4">
          {campo("comprovante_mensagem", "Mensagem no rodapé", { max: 160 })}
          <Campo rotulo="Largura do papel da impressora" dica="Escolha a mesma bobina da impressora térmica. Na hora de imprimir, selecione essa impressora na janela do Windows.">
            <Selecao value={f.comprovante_largura} onChange={(e) => setF({ ...f, comprovante_largura: e.target.value as "80" | "58" })}>
              <option value="80">80 mm (mais comum)</option>
              <option value="58">58 mm</option>
            </Selecao>
          </Campo>
          <p className="rounded-xl bg-[#fff8ea] px-3 py-2 text-[12.5px] text-[#7a4a00]">
            O comprovante sai como “não é documento fiscal”. Emitir NFC-e exige certificado digital, CSC da SEFAZ-RJ e um serviço de emissão — ainda não está ligado.
          </p>
        </div>
      </Cartao>
      <Cartao rotulo="Estoque" titulo="Regra de venda">
        <Interruptor
          ligado={f.permitir_estoque_negativo}
          aoMudar={(v) => setF({ ...f, permitir_estoque_negativo: v })}
          rotulo="Permitir vender sem estoque registrado"
          descricao="Ligado: a venda passa e o estoque fica negativo (bom enquanto o estoque inicial não foi lançado). Desligado: o sistema bloqueia a venda."
        />
      </Cartao>
      <div className="flex items-end justify-end gap-3 xl:col-span-2">
        {erro && <AvisoErro mensagem={erro} />}
        <Botao type="submit" icone={<Save className="size-4" />} carregando={enviando}>
          Salvar configurações
        </Botao>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Usuários e permissões                                                */
/* ------------------------------------------------------------------ */
const PERMISSOES: Array<{ id: Exclude<Permissao, "vender" | "administrar">; titulo: string; texto: string }> = [
  { id: "desconto", titulo: "Dar desconto", texto: "Lançar desconto em R$ ou % na frente de caixa." },
  { id: "cancelar_venda", titulo: "Cancelar venda", texto: "Devolve os produtos ao estoque e o dinheiro sai da gaveta." },
  { id: "produtos", titulo: "Produtos, estoque e produção", texto: "Cadastrar e mudar preços, entradas, ajustes e produção. Vê o custo." },
  { id: "financeiro", titulo: "Financeiro e relatórios", texto: "Início, contas, fluxo de caixa, DRE e relatórios. Vê custo, lucro e despesas." },
];

function SecaoUsuarios() {
  const lista = useApi<Usuario[]>("/api/usuarios");
  const eu = useUsuario();
  const [editando, setEditando] = useState<Usuario | "novo" | null>(null);
  const [senhaDe, setSenhaDe] = useState<Usuario | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const config = useApi<Config>("/api/config");

  async function gerarCodigo() {
    const r = await confirmar({
      titulo: "Gerar um novo código de recuperação?",
      texto: "O código antigo deixa de valer na hora. O novo aparece uma única vez: anote ou imprima e guarde longe do caixa.",
      confirmar: "Gerar novo código",
    });
    if (!r.ok) return;
    setGerando(true);
    try {
      const res = await api.post<{ codigo_recuperacao: string }>("/api/usuarios/codigo-recuperacao");
      setCodigo(res.codigo_recuperacao);
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
      <Cartao
        rotulo="Quem usa o sistema"
        titulo="Usuários"
        corpo={false}
        acoes={
          <Botao icone={<UserPlus className="size-4" />} onClick={() => setEditando("novo")}>
            Novo usuário
          </Botao>
        }
      >
        {lista.erro && (
          <div className="p-4">
            <AvisoErro mensagem={lista.erro} aoTentar={lista.recarregar} />
          </div>
        )}
        {!lista.dados ? (
          lista.erro ? null : <Carregando />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Perfil</th>
                  <th>Pode</th>
                  <th>Último acesso</th>
                  <th className="num">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.dados.map((u) => (
                  <tr key={u.id} className={cx(!u.ativo && "opacity-55")}>
                    <td>
                      <p className="font-semibold">
                        {u.nome}
                        {eu?.id === u.id && <span className="ml-1.5 text-[11.5px] font-semibold text-suave">(você)</span>}
                      </p>
                      {!u.ativo && <Etiqueta>Desativado</Etiqueta>}
                    </td>
                    <td>{u.perfil === "administrador" ? <Etiqueta tom="escuro">Administrador</Etiqueta> : <Etiqueta>Funcionário</Etiqueta>}</td>
                    <td className="max-w-[320px] text-[12.5px] text-[#4a4d52]">
                      {u.perfil === "administrador"
                        ? "Tudo, inclusive usuários e configurações"
                        : ["Vender e caixa", ...PERMISSOES.filter((x) => u.permissoes.includes(x.id)).map((x) => x.titulo.toLowerCase())].join(" · ")}
                    </td>
                    <td className="text-[12.5px] text-suave">{u.ultimo_acesso_em ? dataHora(u.ultimo_acesso_em) : "nunca entrou"}</td>
                    <td className="num">
                      <div className="inline-flex gap-1">
                        <Botao variante="fantasma" tamanho="sm" icone={<Pencil className="size-3.5" />} onClick={() => setEditando(u)}>
                          Editar
                        </Botao>
                        <Botao variante="fantasma" tamanho="sm" icone={<KeyRound className="size-3.5" />} onClick={() => setSenhaDe(u)}>
                          Senha
                        </Botao>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-[#efefeb] px-5 py-3 text-[12px] text-suave">
          Cada venda, abertura e fechamento de caixa fica no nome de quem estava logado. Para alguém sair da equipe, desative o usuário: o histórico continua com o nome dele.
        </p>
      </Cartao>

      <div className="flex flex-col gap-4">
        <Cartao rotulo="Segurança" titulo="Código de recuperação">
          <p className="text-[13px] leading-relaxed text-[#4a4d52]">
            Se um administrador esquecer a senha, ele usa este código na tela de entrada (“Esqueci a senha”) para criar outra. Funcionário que esqueceu a senha: troque aqui, no botão
            “Senha”.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-[#4a4d52]">Perdeu o código, ou alguém pode ter visto? Gere outro: o antigo deixa de valer.</p>
          <Botao className="mt-3" variante="secundario" icone={<ShieldCheck className="size-4" />} carregando={gerando} onClick={() => void gerarCodigo()}>
            Gerar novo código
          </Botao>
        </Cartao>
        <Cartao rotulo="Como funciona" titulo="Perfis">
          <ul className="space-y-2 text-[13px] text-[#4a4d52]">
            <li>
              <b className="text-tinta">Administrador:</b> vê e faz tudo, cadastra usuários e mexe nas configurações e backups.
            </li>
            <li>
              <b className="text-tinta">Funcionário:</b> vende, abre e fecha o caixa. O resto você libera por pessoa (desconto, cancelamento, produtos, financeiro).
            </li>
            <li>A sessão termina depois de 14 horas sem uso; o sistema volta para a tela de entrada.</li>
          </ul>
        </Cartao>
      </div>

      {editando && (
        <FormularioUsuario
          usuario={editando === "novo" ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={(u) => {
            lista.recarregar();
            if (eu && u.id === eu.id) void carregarEstado().catch(() => undefined);
          }}
        />
      )}
      {senhaDe && <SenhaDoUsuario usuario={senhaDe} aoFechar={() => setSenhaDe(null)} />}
      {codigo && (
        <Modal
          aberto
          aoFechar={() => setCodigo(null)}
          titulo="Novo código de recuperação"
          subtitulo="Aparece só agora. O código anterior já não vale."
          largura="sm"
          rodape={
            <>
              <Botao
                variante="secundario"
                icone={<Printer className="size-4" />}
                onClick={() => imprimirNoPapel(<FolhaCodigo codigo={codigo} lojaNome={config.dados?.loja_nome ?? ""} usuario={eu?.nome ?? ""} geradoEm={new Date().toISOString()} />)}
              >
                Imprimir
              </Botao>
              <Botao onClick={() => setCodigo(null)}>Anotei, fechar</Botao>
            </>
          }
        >
          <p data-testid="novo-codigo" className="rounded-2xl border border-borda bg-[#f6f6f3] px-4 py-4 text-center font-mono text-[24px] font-bold tracking-[.14em] select-all">
            {codigo}
          </p>
        </Modal>
      )}
    </div>
  );
}

function FormularioUsuario({ usuario, aoFechar, aoSalvar }: { usuario: Usuario | null; aoFechar: () => void; aoSalvar: (u: Usuario) => void }) {
  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [perfil, setPerfil] = useState<Perfil>(usuario?.perfil ?? "funcionario");
  const [extras, setExtras] = useState<Permissao[]>(() => (usuario ? usuario.permissoes.filter((p) => PERMISSOES.some((x) => x.id === p)) : []));
  const [ativo, setAtivo] = useState(usuario?.ativo ?? true);
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<{ texto: string; campo: string | null } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const erroDe = (c: string) => (erro?.campo === c ? erro.texto : null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (nome.trim().length < 2) return setErro({ texto: "Informe o nome (pelo menos 2 letras).", campo: "nome" });
    if (!usuario) {
      if (senha.length < 4) return setErro({ texto: "A senha precisa ter pelo menos 4 caracteres.", campo: "senha" });
      if (senha !== confirma) return setErro({ texto: "A confirmação não é igual à senha.", campo: "confirma" });
    }
    setEnviando(true);
    setErro(null);
    try {
      const permissoes = perfil === "administrador" ? [] : extras;
      const salvo = usuario
        ? await api.put<Usuario>(`/api/usuarios/${usuario.id}`, { nome: nome.trim(), perfil, permissoes, ativo })
        : await api.post<Usuario>("/api/usuarios", { nome: nome.trim(), perfil, permissoes, senha });
      avisar(usuario ? "Usuário atualizado." : `Usuário "${salvo.nome}" cadastrado.`);
      aoSalvar(salvo);
      aoFechar();
    } catch (er) {
      setErro({ texto: mensagemDeErro(er), campo: er instanceof ErroApi ? er.campo : null });
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={usuario ? `Editar ${usuario.nome}` : "Novo usuário"}
      subtitulo={usuario ? `Cadastrado em ${dataHora(usuario.criado_em)}` : "A pessoa entra escolhendo o nome dela e digitando a senha."}
      largura="md"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-usuario" carregando={enviando}>
            {usuario ? "Salvar" : "Cadastrar usuário"}
          </Botao>
        </>
      }
    >
      <form id="form-usuario" onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome" erro={erroDe("nome")} dica="Como aparece na tela de entrada e nas vendas.">
          <Entrada autoFocus value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} invalido={!!erroDe("nome")} />
        </Campo>
        <div>
          <p className="mb-1.5 text-[12.5px] font-semibold text-[#3d4045]">Perfil</p>
          <div className="grid gap-2 md:grid-cols-2">
            {(
              [
                ["funcionario", "Funcionário", "Vende e cuida do caixa. Você escolhe o que mais ele pode."],
                ["administrador", "Administrador", "Tudo, inclusive usuários, configurações e backups."],
              ] as const
            ).map(([id, titulo, texto]) => (
              <button
                key={id}
                type="button"
                aria-pressed={perfil === id}
                onClick={() => setPerfil(id)}
                className={cx("rounded-xl border px-3.5 py-3 text-left", perfil === id ? "border-tinta bg-[#f6f6f3] ring-1 ring-tinta" : "border-borda hover:border-[#bdbdb7]")}
              >
                <span className="block text-[13.5px] font-bold">{titulo}</span>
                <span className="mt-0.5 block text-[12px] text-suave">{texto}</span>
              </button>
            ))}
          </div>
        </div>
        {perfil === "funcionario" && (
          <div className="rounded-2xl border border-borda p-4">
            <p className="text-[13px] font-bold">Além de vender, este funcionário pode:</p>
            <div className="mt-3 space-y-2.5">
              {PERMISSOES.map((x) => (
                <label key={x.id} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-tinta"
                    checked={extras.includes(x.id)}
                    onChange={(e) => setExtras((l) => (e.target.checked ? [...l, x.id] : l.filter((p) => p !== x.id)))}
                  />
                  <span>
                    <span className="block text-[13.5px] font-semibold">{x.titulo}</span>
                    <span className="block text-[12px] text-suave">{x.texto}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        {!usuario && (
          <div className="grid gap-4 md:grid-cols-2">
            <Campo rotulo="Senha" erro={erroDe("senha")} dica="Pelo menos 4 caracteres (pode ser só números).">
              <CampoSenha value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
            </Campo>
            <Campo rotulo="Repita a senha" erro={erroDe("confirma")}>
              <CampoSenha value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" />
            </Campo>
          </div>
        )}
        {usuario && (
          <Interruptor ligado={ativo} aoMudar={setAtivo} rotulo="Usuário ativo" descricao="Desativado não aparece na tela de entrada e sai do sistema na hora." />
        )}
        {erro && !["nome", "senha", "confirma"].includes(erro.campo ?? "") && <AvisoErro mensagem={erro.texto} />}
      </form>
    </Modal>
  );
}

function SenhaDoUsuario({ usuario, aoFechar }: { usuario: Usuario; aoFechar: () => void }) {
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 4) return setErro("A senha precisa ter pelo menos 4 caracteres.");
    if (senha !== confirma) return setErro("A confirmação não é igual à senha.");
    setEnviando(true);
    setErro(null);
    try {
      await api.post(`/api/usuarios/${usuario.id}/senha`, { senha });
      avisar(`Senha de ${usuario.nome} trocada.`);
      aoFechar();
    } catch (er) {
      setErro(mensagemDeErro(er));
      setEnviando(false);
    }
  }
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={`Nova senha para ${usuario.nome}`}
      subtitulo="Se a pessoa estiver logada em outro lugar, ela sai e entra de novo com a senha nova."
      largura="sm"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-senha-usuario" carregando={enviando}>
            Trocar senha
          </Botao>
        </>
      }
    >
      <form id="form-senha-usuario" onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nova senha" dica="Pelo menos 4 caracteres (pode ser só números).">
          <CampoSenha autoFocus value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
        </Campo>
        <Campo rotulo="Repita a nova senha">
          <CampoSenha value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" />
        </Campo>
        {erro && <AvisoErro mensagem={erro} />}
      </form>
    </Modal>
  );
}

function SecaoFormas() {
  const formas = useApi<FormaPagamento[]>("/api/formas-pagamento?inativas=1");
  const [nova, setNova] = useState({ nome: "", taxa: "" });
  const [erro, setErro] = useState<string | null>(null);
  async function salvarForma(f: FormaPagamento, mudanca: Partial<{ nome: string; taxa_bp: number; ativo: boolean }>) {
    try {
      await api.put(`/api/formas-pagamento/${f.id}`, mudanca);
      avisar("Forma de pagamento atualizada.");
      avisarMudanca();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    }
  }
  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const taxa = textoParaBp(nova.taxa);
    if (!nova.nome.trim()) return setErro("Informe o nome.");
    if (taxa === null) return setErro("Taxa inválida.");
    setErro(null);
    try {
      await api.post("/api/formas-pagamento", { nome: nova.nome, taxa_bp: taxa });
      setNova({ nome: "", taxa: "" });
      avisar("Forma de pagamento criada.");
      avisarMudanca();
    } catch (er) {
      setErro(mensagemDeErro(er));
    }
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <Cartao rotulo="Recebimento" titulo="Formas de pagamento e taxas" corpo={false}>
        {!formas.dados ? (
          <Carregando />
        ) : (
          <table className="tabela mt-2">
            <thead>
              <tr>
                <th>Forma</th>
                <th className="num">Taxa (%)</th>
                <th>Ativa</th>
              </tr>
            </thead>
            <tbody>
              {formas.dados.map((f) => (
                <LinhaForma key={f.id} forma={f} aoSalvar={salvarForma} />
              ))}
            </tbody>
          </table>
        )}
        <p className="px-5 pb-4 text-[12.5px] text-suave">
          A taxa é a porcentagem que a maquininha (ou o banco, no PIX) fica de cada venda. Ela é descontada do lucro nos relatórios. Veja a taxa certa no contrato ou no app da maquininha.
        </p>
      </Cartao>
      <Cartao rotulo="Nova" titulo="Adicionar forma de pagamento">
        <form onSubmit={criar} className="space-y-3">
          <Campo rotulo="Nome">
            <Entrada value={nova.nome} maxLength={40} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="Ex.: Crédito parcelado" />
          </Campo>
          <Campo rotulo="Taxa (%)">
            <Entrada inputMode="decimal" value={nova.taxa} onChange={(e) => setNova({ ...nova, taxa: e.target.value })} placeholder="0,00" />
          </Campo>
          {erro && <AvisoErro mensagem={erro} />}
          <Botao type="submit" icone={<Plus className="size-4" />}>
            Adicionar
          </Botao>
        </form>
      </Cartao>
    </div>
  );
}

function LinhaForma({ forma, aoSalvar }: { forma: FormaPagamento; aoSalvar: (f: FormaPagamento, m: Partial<{ taxa_bp: number; ativo: boolean }>) => Promise<void> }) {
  const [taxa, setTaxa] = useState(bpParaTexto(forma.taxa_bp));
  const bp = textoParaBp(taxa);
  const mudou = bp !== null && bp !== forma.taxa_bp;
  return (
    <tr>
      <td>
        <p className="font-semibold">{forma.nome}</p>
        {forma.tipo === "dinheiro" && <p className="text-[12px] text-suave">Entra na gaveta e permite troco</p>}
      </td>
      <td className="num">
        {forma.tipo === "dinheiro" ? (
          "—"
        ) : (
          <div className="inline-flex items-center gap-2">
            <Entrada className={cx("w-24 text-right", bp === null && "border-perigo")} inputMode="decimal" value={taxa} onChange={(e) => setTaxa(e.target.value)} />
            <Botao tamanho="sm" variante={mudou ? "primario" : "secundario"} disabled={!mudou} onClick={() => void aoSalvar(forma, { taxa_bp: bp! })}>
              Salvar
            </Botao>
          </div>
        )}
      </td>
      <td>
        <Interruptor ligado={forma.ativo} disabled={forma.tipo === "dinheiro"} aoMudar={(v) => void aoSalvar(forma, { ativo: v })} rotulo={forma.ativo ? "Ativa" : "Desativada"} />
      </td>
    </tr>
  );
}

function SecaoCategorias() {
  const categorias = useApi<Categoria[]>("/api/financeiro/categorias?inativas=1");
  const [nova, setNova] = useState<{ nome: string; tipo: TipoLancamento; conta: boolean }>({ nome: "", tipo: "despesa", conta: true });
  const [erro, setErro] = useState<string | null>(null);
  async function atualizar(c: Categoria, mudanca: Partial<{ conta_no_resultado: boolean; ativo: boolean }>) {
    try {
      await api.put(`/api/financeiro/categorias/${c.id}`, mudanca);
      avisarMudanca();
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    }
  }
  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.post("/api/financeiro/categorias", { nome: nova.nome, tipo: nova.tipo, conta_no_resultado: nova.conta });
      setNova({ ...nova, nome: "" });
      avisar("Categoria criada.");
      avisarMudanca();
    } catch (er) {
      setErro(mensagemDeErro(er));
    }
  }
  const grupos: Array<[TipoLancamento, string]> = [
    ["despesa", "Despesas"],
    ["receita", "Receitas"],
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <div className="flex flex-col gap-4">
        {grupos.map(([tipo, titulo]) => (
          <Cartao key={tipo} rotulo="Financeiro" titulo={titulo} corpo={false}>
            {!categorias.dados ? (
              <Carregando />
            ) : (
              <table className="tabela mt-2">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>Conta no lucro?</th>
                    <th>Ativa</th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.dados
                    .filter((c) => c.tipo === tipo)
                    .map((c) => (
                      <tr key={c.id} className={cx(!c.ativo && "opacity-55")}>
                        <td>
                          <p className="font-semibold">{c.nome}</p>
                          <p className="text-[12px] text-suave">{c.lancamentos ? `${c.lancamentos} lançamento(s)` : "sem lançamentos"}</p>
                        </td>
                        <td>
                          <Interruptor
                            ligado={c.conta_no_resultado}
                            disabled={c.sistema === "compra_mercadoria"}
                            aoMudar={(v) => void atualizar(c, { conta_no_resultado: v })}
                            rotulo={c.conta_no_resultado ? "Sim" : "Não"}
                          />
                        </td>
                        <td>
                          <Interruptor ligado={c.ativo} disabled={c.sistema === "compra_mercadoria"} aoMudar={(v) => void atualizar(c, { ativo: v })} rotulo={c.ativo ? "Ativa" : "Desativada"} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </Cartao>
        ))}
      </div>
      <Cartao rotulo="Nova" titulo="Criar categoria">
        <form onSubmit={criar} className="space-y-3">
          <Campo rotulo="Tipo">
            <Selecao value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as TipoLancamento })}>
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </Selecao>
          </Campo>
          <Campo rotulo="Nome">
            <Entrada value={nova.nome} maxLength={60} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="Ex.: Material de embalagem" />
          </Campo>
          <Interruptor ligado={nova.conta} aoMudar={(v) => setNova({ ...nova, conta: v })} rotulo="Conta no lucro" descricao="Desligue para dinheiro que não é custo nem receita da loja (ex.: retirada do dono)." />
          {erro && <AvisoErro mensagem={erro} />}
          <Botao type="submit" icone={<Plus className="size-4" />} disabled={!nova.nome.trim()}>
            Criar categoria
          </Botao>
        </form>
      </Cartao>
    </div>
  );
}

const MOTIVOS: Record<InfoBackup["motivo"], string> = {
  automatico: "Automático do dia",
  manual: "Feito à mão",
  fechamento: "Fechamento de caixa",
  "antes-de-restaurar": "Antes de restaurar",
  desligamento: "Ao desligar",
  "antes-de-atualizar": "Antes de atualizar o programa",
};

function SecaoBackup() {
  const backups = useApi<{ pasta: string; backups: InfoBackup[] }>("/api/backups");
  const [fazendo, setFazendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function fazer() {
    setFazendo(true);
    setErro(null);
    try {
      const b = await api.post<InfoBackup>("/api/backups");
      avisar(`Backup feito: ${b.nome}`);
      backups.recarregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setFazendo(false);
    }
  }
  async function restaurar(b: InfoBackup) {
    const r = await confirmar({
      titulo: "Restaurar este backup?",
      texto: `Os dados voltam a ser os de ${data(b.data)} às ${b.hora}. Tudo o que foi feito depois disso sai do sistema. Antes, o sistema guarda uma cópia dos dados de agora.`,
      confirmar: "Restaurar",
      perigo: true,
    });
    if (!r.ok) return;
    try {
      const res = await api.post<{ conferencia: { vendas: number; produtos: number } }>(`/api/backups/${encodeURIComponent(b.nome)}/restaurar`);
      await sair(`Backup restaurado (${res.conferencia.produtos} produtos, ${res.conferencia.vendas} vendas). Entre de novo com o seu usuário.`);
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    }
  }
  async function restaurarArquivo(arquivo: File) {
    const r = await confirmar({
      titulo: `Restaurar o arquivo ${arquivo.name}?`,
      texto: "Os dados de agora são substituídos pelos do arquivo (uma cópia dos dados de agora é guardada antes).",
      confirmar: "Restaurar arquivo",
      perigo: true,
    });
    if (!r.ok) return;
    const form = new FormData();
    form.append("arquivo", arquivo);
    try {
      const res = await api.enviarArquivo<{ conferencia: { vendas: number; produtos: number } }>("/api/backups/restaurar-arquivo", form);
      await sair(`Arquivo restaurado (${res.conferencia.produtos} produtos, ${res.conferencia.vendas} vendas). Entre de novo com o seu usuário.`);
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    }
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <Cartao
        rotulo="Cópias de segurança"
        titulo="Backups do banco de dados"
        acoes={
          <Botao icone={<DatabaseBackup className="size-4" />} carregando={fazendo} onClick={() => void fazer()}>
            Fazer backup agora
          </Botao>
        }
        corpo={false}
      >
        {erro && (
          <div className="px-5 pt-3">
            <AvisoErro mensagem={erro} />
          </div>
        )}
        {!backups.dados ? (
          <Carregando />
        ) : backups.dados.backups.length === 0 ? (
          <Vazio titulo="Nenhum backup ainda" />
        ) : (
          <div className="max-h-[520px] overflow-y-auto">
            <table className="tabela mt-2">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Motivo</th>
                  <th className="num">Tamanho</th>
                  <th className="num">Ações</th>
                </tr>
              </thead>
              <tbody>
                {backups.dados.backups.map((b) => (
                  <tr key={b.nome}>
                    <td className="font-semibold">
                      {data(b.data)} {b.hora}
                    </td>
                    <td>
                      <Etiqueta tom={b.motivo === "manual" ? "info" : "neutro"}>{MOTIVOS[b.motivo]}</Etiqueta>
                    </td>
                    <td className="num">{tamanhoArquivo(b.tamanho_bytes)}</td>
                    <td className="num">
                      <div className="inline-flex gap-1">
                        <a
                          href={`/api/backups/${encodeURIComponent(b.nome)}`}
                          download={b.nome}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-borda px-2.5 text-[12.5px] font-semibold hover:bg-[#fafaf8]"
                        >
                          <Download className="size-3.5" /> Baixar
                        </a>
                        <Botao tamanho="sm" variante="secundario" icone={<RotateCcw className="size-3.5" />} onClick={() => void restaurar(b)}>
                          Restaurar
                        </Botao>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
      <div className="flex flex-col gap-4">
        <Cartao rotulo="Como funciona" titulo="Os dados ficam neste computador">
          <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-[#4a4d52]">
            <li>Todo dia, ao abrir o programa, é feito um backup automático. Também no fechamento do caixa e ao desligar.</li>
            <li>Os 90 backups mais recentes ficam guardados na pasta abaixo.</li>
            <li>
              <strong>Copie um backup para um pendrive ou para a nuvem toda semana</strong> (botão “Baixar”). Se o computador estragar, é ele que salva a loja.
            </li>
          </ul>
          {backups.dados && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#f6f6f3] p-3 text-[12px] break-all text-[#4a4d52]">
              <FolderOpen className="mt-0.5 size-4 shrink-0" /> {backups.dados.pasta}
            </p>
          )}
        </Cartao>
        <Cartao rotulo="Trazer de outro lugar" titulo="Restaurar de um arquivo">
          <p className="mb-3 text-[13px] text-suave">Use para trazer os dados de um pendrive ou de outro computador (arquivo .db de backup do TF Pipas).</p>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-borda px-4 py-2.5 text-[13.5px] font-semibold hover:bg-[#fafaf8]">
            <HardDriveUpload className="size-4" /> Escolher arquivo .db
            <input
              type="file"
              accept=".db"
              className="hidden"
              onChange={(e) => {
                const a = e.target.files?.[0];
                e.target.value = "";
                if (a) void restaurarArquivo(a);
              }}
            />
          </label>
        </Cartao>
      </div>
    </div>
  );
}

function SecaoSistema() {
  const saude = useApi<Saude>("/api/saude");
  const [desligado, setDesligado] = useState(false);
  async function desligar() {
    const r = await confirmar({
      titulo: "Desligar o TF Pipas?",
      texto: "O programa faz um backup e fecha. Para usar de novo, abra pelo atalho da área de trabalho.",
      confirmar: "Desligar",
      perigo: true,
    });
    if (!r.ok) return;
    try {
      await api.post("/api/sistema/desligar");
      setDesligado(true);
    } catch (e) {
      avisar(mensagemDeErro(e), "erro");
    }
  }
  if (desligado) {
    return (
      <Cartao>
        <Vazio icone={<Power className="size-6" />} titulo="TF Pipas desligado" texto="Pode fechar esta janela. Para abrir de novo, use o atalho TF Pipas na área de trabalho." />
      </Cartao>
    );
  }
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Cartao rotulo="Programa" titulo="Sobre este computador">
        {!saude.dados ? (
          <Carregando />
        ) : (
          <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-[13.5px]">
            <dt className="text-suave">Versão</dt>
            <dd className="font-semibold">{saude.dados.versao}</dd>
            <dt className="text-suave">Data do sistema</dt>
            <dd>{data(saude.dados.hoje)}</dd>
            <dt className="text-suave">Pasta dos dados</dt>
            <dd className="break-all">{saude.dados.pasta_dados}</dd>
            <dt className="text-suave">Internet</dt>
            <dd>Não precisa. Tudo roda neste computador.</dd>
          </dl>
        )}
        <p className="mt-4 text-[12.5px] text-suave">Confira se a data e a hora do Windows estão certas: as vendas usam o relógio do computador.</p>
      </Cartao>
      <Cartao rotulo="Encerrar" titulo="Desligar o programa">
        <p className="mb-4 text-[13.5px] text-[#4a4d52]">Fechar a janela não desliga o programa (ele continua rodando escondido, pronto para abrir rápido). Use este botão antes de atualizar o TF Pipas.</p>
        <Botao variante="perigo" icone={<Power className="size-4" />} onClick={() => void desligar()}>
          Desligar o TF Pipas
        </Botao>
      </Cartao>
    </div>
  );
}
