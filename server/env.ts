// Carrega o .env (Node 22 tem suporte nativo) antes de qualquer leitura de config.
import nodeProcess from "node:process";
import { existsSync } from "node:fs";

if (existsSync(".env")) nodeProcess.loadEnvFile(".env");

export const process = nodeProcess;
