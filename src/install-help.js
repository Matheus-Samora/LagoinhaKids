export function installHelp({userAgent='',platform='',touchPoints=0,native=false}={}){
 if(native)return 'Você já está no APK. As telas são atualizadas pelo servidor. Para instalar o portal em outro aparelho, abra o endereço no navegador.';
 if(/iPad|iPhone|iPod/i.test(userAgent)||(/Mac/i.test(platform)&&touchPoints>1))return 'No iPhone ou iPad, abra o portal no Safari. Toque em Compartilhar e em Adicionar à Tela de Início.';
 if(/Android/i.test(userAgent))return 'No Chrome do Android, abra o menu ⋮ e escolha Instalar aplicativo ou Adicionar à tela inicial. O APK abaixo oferece os chamados nativos do Kids.';
 return 'No computador, abra o portal no Chrome ou Edge e use o ícone de instalação na barra de endereço ou a opção Instalar aplicativo no menu. Em outros navegadores, use o site normalmente.';
}
