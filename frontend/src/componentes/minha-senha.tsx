import { useState } from "react";
import { api, ErroApi, mensagemDeErro } from "../api";
import { avisar } from "./avisos";
import { AvisoErro, Botao, Campo, CampoSenha, Modal } from "./ui";

/** Trocar a própria senha (qualquer usuário). */
export function MinhaSenha({ aoFechar }: { aoFechar: () => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<{ texto: string; campo: string | null } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (nova.length < 4) return setErro({ texto: "A nova senha precisa ter pelo menos 4 caracteres.", campo: "nova_senha" });
    if (nova !== confirma) return setErro({ texto: "A confirmação não é igual à nova senha.", campo: "confirma" });
    setEnviando(true);
    setErro(null);
    try {
      await api.post("/api/auth/minha-senha", { senha_atual: atual, nova_senha: nova });
      avisar("Senha trocada.");
      aoFechar();
    } catch (er) {
      setErro({ texto: mensagemDeErro(er), campo: er instanceof ErroApi ? er.campo : null });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Trocar minha senha"
      largura="sm"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-minha-senha" carregando={enviando}>
            Trocar senha
          </Botao>
        </>
      }
    >
      <form id="form-minha-senha" onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Senha atual" erro={erro?.campo === "senha_atual" ? erro.texto : null}>
          <CampoSenha autoFocus value={atual} onChange={(e) => setAtual(e.target.value)} />
        </Campo>
        <Campo rotulo="Nova senha" dica="Pelo menos 4 caracteres (pode ser só números)." erro={erro?.campo === "nova_senha" ? erro.texto : null}>
          <CampoSenha value={nova} onChange={(e) => setNova(e.target.value)} />
        </Campo>
        <Campo rotulo="Repita a nova senha" erro={erro?.campo === "confirma" ? erro.texto : null}>
          <CampoSenha value={confirma} onChange={(e) => setConfirma(e.target.value)} />
        </Campo>
        {erro && !["senha_atual", "nova_senha", "confirma"].includes(erro.campo ?? "") && <AvisoErro mensagem={erro.texto} />}
      </form>
    </Modal>
  );
}
