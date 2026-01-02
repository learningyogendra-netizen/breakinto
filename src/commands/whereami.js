import fs from 'fs';
import { highlight } from 'cli-highlight';
import chalk from 'chalk';

export function showContext(location, contextLines = 5) {
    if (!location || !location.file) {
        console.log(chalk.red('Could not determine location.'));
        return;
    }

    try {
        const content = fs.readFileSync(location.file, 'utf8');
        const lines = content.split('\n');
        const start = Math.max(0, location.line - 1 - contextLines);
        const end = Math.min(lines.length, location.line - 1 + contextLines + 1);

        const snippet = lines.slice(start, end).map((line, idx) => {
            const lineNum = start + idx + 1;
            const isCurrent = lineNum === location.line;
            const marker = isCurrent ? chalk.red('>') : ' ';
            return `${marker} ${chalk.gray(lineNum.toString().padEnd(4))} ${line}`;
        }).join('\n');

        // Simple highlighting for now - strictly we should highlight the code substring
        // but cli-highlight works better on blocks.
        // For now, let's just print it.
        console.log(snippet);

    } catch (err) {
        console.error(chalk.red(`Error reading file: ${err.message}`));
    }
}
