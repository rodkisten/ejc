import React from 'react';
import { Link } from 'react-router-dom';
import { LockKeyhole, ShieldCheck, KeyRound, Clock3 } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="privacy-page">
      <span className="eyebrow">XX EJC SIMONÉSIA · PRIVACIDADE</span>
      <h1>Suas palavras merecem respeito. ♡</h1>
      <p className="muted">
        Uma cartinha pode ter lembranças muito pessoais. Por isso, o Mini Mercado
        não oferece galeria pública nem revisão do conteúdo pela coordenação.
      </p>
      <div className="form-card">
        <h2><ShieldCheck size={22} /> O que a coordenação pode ver?</h2>
        <p>
          Somente informações operacionais para conferir o pagamento e acompanhar
          o envio: número do pedido, destinatário, valor, situação do Pix e
          indicação de que a cartinha foi enviada. Não há tela administrativa para
          ler textos, ver fotos ou ouvir gravações.
        </p>
      </div>
      <div className="form-card">
        <h2><Clock3 size={22} /> Quando a mensagem aparece?</h2>
        <p>
          Mesmo depois de gerar o Pix, você pode usar o link privado para
          editar e confirmar o texto, o remetente, a decoração, as fotos e os áudios.
          As alterações são salvas no servidor sem mudar o valor ou o código Pix.
          O envio da homenagem ao mural só é permitido depois de a equipe
          confirmar o pagamento no extrato. Ela será exibida no mural privado
          do encontrista após o horário de liberação, sem moderação do conteúdo.
        </p>
      </div>
      <div className="form-card">
        <h2><KeyRound size={22} /> Quem consegue abrir o mural?</h2>
        <p>
          Quem tiver o link privado ou o código da etiqueta. Por isso, esse código
          precisa ficar em segredo. A equipe que gera ou imprime as etiquetas pode
          conhecer os códigos; não compartilhe fotos das etiquetas nas redes sociais.
        </p>
      </div>
      <div className="form-card">
        <h2><LockKeyhole size={22} /> Sobre a proteção técnica</h2>
        <p>
          O acesso às cartas e anexos é restrito pelo aplicativo. Os dados são
          armazenados na infraestrutura de nuvem utilizada pelo site. Esta versão
          <strong> não implementa criptografia de ponta a ponta</strong>: pessoas
          com acesso técnico privilegiado à infraestrutura podem, em princípio,
          acessar dados armazenados. Por isso, não prometemos impossibilidade
          absoluta de acesso fora do aplicativo.
        </p>
        <p>
          Não enviamos texto das cartinhas, fotos, áudios ou códigos secretos ao
          Google Analytics. O uso de estatísticas de navegação depende de
          consentimento.
        </p>
      </div>
      <Link className="btn" to="/">Voltar às cartinhas</Link>
    </div>
  );
}
