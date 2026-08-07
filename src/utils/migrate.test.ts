// A detecção por IP gravava `preferred-language` sozinha: quem acessava do
// Japão passava a abrir a loja em japonês PARA SEMPRE, sem nunca ter pedido —
// inclusive a dona da loja, que só via português depois de entrar no painel
// (texto fixo). A detecção de idioma saiu; esta limpeza tira o resíduo dela dos
// navegadores que já visitaram a loja.
//
// A marca `preferred-language-source` é o que separa escolha de automatismo.
import { beforeEach, describe, expect, it } from 'vitest';
import { migrateLocalStorage } from '@/utils/migrate';

describe('migrateLocalStorage — idioma', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('apaga o idioma que a detecção por IP havia gravado', () => {
    localStorage.setItem('preferred-language', 'ja');
    localStorage.setItem('sakura_selected_country', 'Japão');

    migrateLocalStorage();

    expect(localStorage.getItem('preferred-language')).toBeNull();
    // País é geografia (preço/frete): continua salvo.
    expect(localStorage.getItem('sakura_selected_country')).toBe('Japão');
  });

  it('preserva o idioma escolhido no seletor', () => {
    localStorage.setItem('preferred-language', 'ja');
    localStorage.setItem('preferred-language-source', 'user');

    migrateLocalStorage();

    expect(localStorage.getItem('preferred-language')).toBe('ja');
  });

  it('roda duas vezes sem apagar a escolha feita depois da primeira', () => {
    localStorage.setItem('preferred-language', 'ja');

    migrateLocalStorage();
    // Cliente escolhe japonês de novo, agora pelo seletor.
    localStorage.setItem('preferred-language', 'ja');
    localStorage.setItem('preferred-language-source', 'user');
    migrateLocalStorage();

    expect(localStorage.getItem('preferred-language')).toBe('ja');
  });

  it('não mexe nas chaves de marca antiga que já foram migradas', () => {
    localStorage.setItem('japan-express-users', '{"a":1}');
    localStorage.setItem('sweet-japan-users', '{"b":2}');

    migrateLocalStorage();

    expect(localStorage.getItem('japan-express-users')).toBe('{"a":1}');
    expect(localStorage.getItem('sweet-japan-users')).toBe('{"b":2}');
  });
});
