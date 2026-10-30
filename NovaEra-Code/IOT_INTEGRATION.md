# TempIC — Integração IoT

## Arquitetura atual

- `php/tempic-api.php` autentica sessões web e controla os endpoints do dashboard.
- `php/tempic-database.php` persiste usuários, sensores, leituras, alertas e ajustes de temperatura em SQLite.
- `php/tempic-core.php` contém `TemperatureProvider`, `DemoTemperatureProvider` e `SensorSimulator`.
- `js/tempic-app.js` consome a API; não cria leituras nem mantém sensores em `localStorage`.

O modo atual é explicitamente **demonstração**. A interface mostra esse estado e não declara que existe um ESP32 conectado. O campo de senha Wi-Fi é apenas apresentado na configuração: não é enviado ao backend nem armazenado. Somente o SSID é salvo.

## Provider de demonstração

O endpoint autenticado `POST php/tempic-api.php?action=reading` seleciona `DemoTemperatureProvider`, gera uma leitura e chama `TempicDatabase::recordReading()`. A tela solicita uma leitura a cada 15 segundos enquanto a Home está aberta. O provider atualiza temperatura, horário, status, histórico e alertas no banco.

## Ponto de integração real

O ponto de troca está no bloco `action=reading` de `php/tempic-api.php`, onde `DemoTemperatureProvider` é selecionado. Os comentários `TODO: INTEGRAÇÃO IoT REAL / MQTT` e `TODO: RECEBER DADOS DO ESP32` marcam esse local.

Para hardware real:

1. Implemente um provider de telemetria autenticada que satisfaça `TemperatureProvider` em `php/tempic-core.php`.
2. Crie uma rota de ingestão separada da sessão web, autenticada por credencial individual do dispositivo (hash armazenado no banco; nunca aceite apenas um `sensor_id`).
3. Valide o payload, o vínculo do dispositivo ao sensor e a faixa/precisão da temperatura.
4. Entregue a leitura validada a `TempicDatabase::recordReading($userId, $sensorId, $temperature)`; esse método grava o histórico, atualiza o estado e abre/resolve alertas.
5. Para MQTT, um subscriber backend autenticado deve chamar o mesmo serviço de gravação; não exponha credenciais do broker no navegador.
6. Selecione o provider real pelo `source_mode` do sensor. O dashboard já obtém histórico, estatísticas e alertas da API persistente.

Payload sugerido para a futura rota:

```json
{
  "sensorId": "identificador-do-dispositivo",
  "temperature": 4.2,
  "recordedAt": "2026-09-25T14:30:00Z"
}
```

Esse payload é apenas um contrato de integração; a rota de ingestão do dispositivo ainda não está habilitada. O endpoint `action=reading` atual exige sessão web e só gera simulação.

## Estado e alertas

- `Online`/`Offline` depende da última atualização (offline após 60 segundos sem leitura).
- `Normal`, `Atenção` e `Alerta` são calculados comparando a leitura com os limites do sensor.
- Alertas acima/abaixo dos limites são gravados e resolvidos quando uma leitura volta à faixa.
- Histórico e estatísticas usam os registros persistidos, com filtros de 24 horas, 7 dias e 30 dias.
