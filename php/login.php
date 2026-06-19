<?php
session_start();

// Login teste
$usuario_teste = "usuarioteste@novaera.com";
$senha_teste = "123456";

// Verifica se o formulário foi enviado
if ($_SERVER["REQUEST_METHOD"] == "POST") {

    $email = $_POST["email"];
    $senha = $_POST["password"];

    // Verifica login
    if ($email == $usuario_teste && $senha == $senha_teste) {

        $_SESSION["usuarios"] = $email;

        // Redireciona
        header("Location: index.php");
        exit();

    } else {

        header("Location: login.php?erro=1");
        exit();
    }
}
?>

<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="login.css">
<title>Login - NovaEra Code</title>

</head>



<div class="login-container">

    <div class="login-box">

        <!-- IMAGEM REDONDA -->
        <img src="img/logonova.png" alt="Usuário" class="profile-image">

        <?php
        if (isset($_GET['erro'])) {
            echo "<div class='erro'>E-mail ou senha incorretos!</div>";
        }
        ?>

        <form method="POST" action="">

            <div class="input-group">
                <label for="email">E-mail</label>

                <input 
                    type="email" 
                    name="email" 
                    id="email" 
                    placeholder="Digite seu e-mail" 
                    required
                >
            </div>

            <div class="input-group">
                <label for="password">Senha</label>

                <input 
                    type="password" 
                    name="password" 
                    id="password" 
                    placeholder="Digite sua senha" 
                    required
                >
            </div>

            <button type="submit" class="btn-login">
                Entrar
            </button>
            <br><br>
            <div class="register-link">
            <p>Não tem uma conta?
                <a href="html/cadastro.html">Cadastre-se</a>
            </p>
            </div>

        </form>

    </div>

</div>

</body>
</html>