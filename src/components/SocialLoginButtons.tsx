import React from 'react';
import SocialLoginButton from './SocialLoginButton';

/**
 * Métodos de login alternativos das telas de Login e Cadastro. O divisor "ou"
 * que aparece acima mora nas páginas, não aqui — se este bloco não renderizar
 * nada, sobra um "ou" solto embaixo do formulário.
 *
 * Só o Google fica visível. Os outros três continuam fora, cada um por um
 * motivo diferente:
 *
 *   Facebook   app ainda não aprovado no Meta — e o provedor nem existe no
 *              Firebase, então o clique daria auth/operation-not-allowed
 *   Twitter/X  configurado e ativo no Firebase, escondido para encurtar o fluxo
 *   Telefone   SMS ativo no Firebase, escondido pelo mesmo motivo
 *
 * Para trazer qualquer um de volta basta a linha do componente — ambos seguem
 * no repo: `SocialLoginButton` (provider) e `PhoneLoginButton`.
 */
const SocialLoginButtons: React.FC<{ disabled?: boolean; mode?: 'login' | 'register' }> = ({
  disabled = false,
  mode = 'login',
}) => (
  <div className="space-y-3">
    <SocialLoginButton provider="google" mode={mode} disabled={disabled} />
  </div>
);

export default SocialLoginButtons;
