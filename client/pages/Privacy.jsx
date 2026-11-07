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
          Depois de confirmar o Pix, você pode escrever, gravar, revisar e enviar
          sua homenagem. Ela será exibida automaticamente no mural privado do
          encontrista após o horário definido para a liberação.
          Não existe aprovação ou moderação da coordenação.
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
