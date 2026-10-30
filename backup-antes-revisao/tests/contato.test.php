<?php
require_once __DIR__ . '/../php/contato-database.php';

use NovaEra\Contato\ContactInbox;

$databasePath = tempnam(sys_get_temp_dir(), 'novaera-contato-test-');
if ($databasePath === false) {
    throw new RuntimeException('Não foi possível criar banco temporário para o teste.');
}
unlink($databasePath);

try {
    $valid = [
        'nome' => 'Ana Souza',
        'email' => 'ana@example.test',
        'assunto' => '',
        'mensagem' => 'Gostaria de um orçamento para um site institucional.',
    ];

    if (ContactInbox::validate($valid) !== []) {
        throw new RuntimeException('Falha: mensagem válida foi rejeitada.');
    }

    $invalid = ContactInbox::validate(['nome' => 'A', 'email' => 'nao-e-email', 'assunto' => 'ab', 'mensagem' => 'curta']);
    foreach (['nome', 'email', 'assunto', 'mensagem'] as $field) {
        if (!isset($invalid[$field])) {
            throw new RuntimeException("Falha: campo inválido '{$field}' não foi apontado.");
        }
    }

    $inbox = new ContactInbox($databasePath);
    $id = $inbox->save($valid);
    $saved = $inbox->find($id);

    if (!$saved || $saved['email'] !== 'ana@example.test' || $saved['subject'] !== 'Contato pelo site') {
        throw new RuntimeException('Falha: mensagem salva não corresponde à enviada.');
    }

    echo "Teste contato: OK\n";
} finally {
    $inbox = null;
    foreach ([$databasePath, $databasePath . '-journal'] as $path) {
        if (is_file($path)) {
            unlink($path);
        }
    }
}
