# Deploy no EasyPanel (Hostinger)

## 1. Pré-requisitos

- VPS com EasyPanel instalado
- Domínio (ou subdomínio) apontando pro IP da VPS — pode ser do tipo `habbo.seudominio.com`
- Pelo menos **2 vCPU e 8 GB de RAM** (1ª build come ~4 GB)

## 2. Push do repo pro GitHub

Empurra a branch principal e o submódulo `nitro/nitro-react` (que está no branch `gather-pivot`) pros teus forks.

```
# fork de billsonnn/nitro-react no seu GitHub primeiro
cd nitro/nitro-react
git remote set-url origin git@github.com:SEU_USUARIO/nitro-react-gather.git
git push -u origin gather-pivot

cd ../..
git remote set-url origin git@github.com:SEU_USUARIO/nitro-docker-gather.git
git push -u origin main
```

> Se preferir não usar fork público do nitro-react, tem que avisar — empacotamos o submódulo no parent repo via tarball.

## 3. EasyPanel: criar o projeto

1. EasyPanel → **+ Novo** → **Projeto** (você já tem o `habbo`)
2. Dentro do projeto: **+ Novo** → **Docker Compose**
3. **Source**: aponte pro repo Git
4. **Compose File**: `docker-compose.yaml`

## 4. Variáveis de ambiente

No serviço **nitro** dentro do EasyPanel, adicione:

| Var | Valor |
|---|---|
| `PUBLIC_HOST` | `habbo.seudominio.com` (sem `https://`) |
| `PUBLIC_TLS` | `1` |

Defaults usados se nada for setado: `PUBLIC_HOST=localhost:8090`, `PUBLIC_TLS=0` (modo dev local).

## 5. Mapeamento de domínio

- Aponte o domínio pro **serviço `caddy`**, **porta `8090`**
- Marque a caixa de **HTTPS** (EasyPanel termina TLS via Let's Encrypt e proxia HTTP→Caddy)

Depois do primeiro deploy:
- `https://habbo.seudominio.com/` = client
- `https://habbo.seudominio.com/?sso=1&name=Manoel` = login do admin
- `https://habbo.seudominio.com/?sso=42&name=Joao` = aluno 42

## 6. Primeira build

Demora **30 a 60 minutos** na primeira vez:

- Maven baixando deps Java do Arcturus
- `yarn install` no nitro-converter e nitro-react
- Conversão de ~10.000 SWFs em `.nitro` (um a um)

Acompanhe os logs do EasyPanel no serviço `nitro`. Sinal de pronto: linha `nitro-dev-server: started`.

> Se a VPS tiver pouca RAM (<8 GB) e outros serviços rodando, **pare temporariamente** os outros pra garantir que a build não dá OOM.

## 7. Migração inicial do banco

O arquivo `mysql/dumps/zz-gather-pivot.sql` roda automaticamente no **primeiro boot** do MariaDB e:

- Cria 500 usuários (auth_ticket `1`–`500`)
- Admin = SSO 1 e 2 (rank 7), resto Member (rank 1)
- Catálogo grátis, dinheiro infinito, HC permanente
- Renomeia categorias do navegador pra PT-BR
- Marca a Sala de Estudos (id 50) como Staff Pick

Se você rebuildar o volume do MySQL (`docker volume rm`), o seed roda de novo.

## 8. Recursos extras opcionais

### TURN próprio (em vez do `openrelay.metered.ca` público)

O `useWebRTC.ts` já tem a lista de TURN servers. Se quiser self-host:

```yaml
  coturn:
    image: coturn/coturn
    network_mode: host
    command: -n --log-file=stdout --no-tls --no-dtls --realm=habbo.seudominio.com --listening-port=3478 --user=gather:troqueAqui
    restart: unless-stopped
```

Depois é só trocar as URLs em `useWebRTC.ts` pra `turn:habbo.seudominio.com:3478` com user/pw definidos.

### Logs do Arcturus

```
docker logs -f arcturus
```

### Reset total do banco

```
docker-compose down -v   # apaga volumes
docker-compose up -d     # rebuilda + reaplica zz-gather-pivot.sql
```

## Embed em outro site (iframe)

```html
<iframe
  src="https://habbo.seudominio.com/?sso=42&name=João Silva"
  width="100%"
  height="100%"
  allow="camera; microphone; autoplay"
  style="border:0">
</iframe>
```

Requisitos:

- **Página parent precisa ser HTTPS** (browser bloqueia delegar mic/cam pra iframe HTTP)
- **`allow="camera; microphone"`** obrigatório no iframe pro WebRTC funcionar
- **URL com `?sso=N&name=NOME`** entra direto sem popup (NameGate detecta e auto-aplica)
- **`autoplay`** ajuda o vídeo do peer remoto rodar sem clique

O Caddyfile já libera embed (sem `X-Frame-Options`, com `frame-ancestors *`).

## Modo local (dev)

```
docker-compose up -d
```

Sem `PUBLIC_HOST` setado, abre em `http://localhost:8090/?sso=1&name=Admin`.
