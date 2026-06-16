import { execSync } from 'node:child_process';

async function checkDocker() {
  let hasClack = false;
  let p, pc;
  try {
    p = await import('@clack/prompts');
    pc = (await import('picocolors')).default;
    hasClack = true;
  } catch (e) {
    // Fallback to simple console log if dependencies are not loaded yet
  }

  const logSuccess = (msg) => {
    if (hasClack) {
      p.log.success(pc.green(msg));
    } else {
      console.log(`[SUCCESS] ${msg}`);
    }
  };

  const logWarn = (msg) => {
    if (hasClack) {
      p.log.warn(pc.yellow(msg));
    } else {
      console.warn(`[WARNING] ${msg}`);
    }
  };

  const logError = (msg) => {
    if (hasClack) {
      p.log.error(pc.red(msg));
    } else {
      console.error(`[ERROR] ${msg}`);
    }
  };

  if (hasClack) {
    p.intro(pc.bgBlue(pc.black(' Docker Environment Check ')));
  } else {
    console.log('\n--- Checking Docker Environment ---');
  }

  let dockerInstalled = false;
  try {
    execSync('docker --version', { stdio: 'ignore' });
    dockerInstalled = true;
  } catch (e) {
    // Docker is not installed or not in PATH
  }

  if (!dockerInstalled) {
    logError('Docker is not installed or not found in your PATH.');
    
    let installedSuccessfully = false;
    const isInteractive = process.stdout.isTTY && hasClack;

    if (isInteractive) {
      const confirmInstall = await p.confirm({
        message: 'Would you like to automatically install Docker now?',
        initialValue: true
      });

      if (p.isCancel(confirmInstall)) {
        p.cancel('Installation cancelled.');
      } else if (confirmInstall) {
        const platform = process.platform;
        const installSpinner = p.spinner();
        installSpinner.start('Starting installation process...');
        
        try {
          if (platform === 'win32') {
            installSpinner.stop('Starting Windows winget installer. Please accept any UAC prompts...');
            execSync('winget install --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements', { stdio: 'inherit' });
            installedSuccessfully = true;
          } else if (platform === 'darwin') {
            installSpinner.stop('Checking Homebrew...');
            let hasBrew = false;
            try {
              execSync('brew --version', { stdio: 'ignore' });
              hasBrew = true;
            } catch (e) {}

            if (hasBrew) {
              console.log('Homebrew found. Starting installation via Homebrew Cask...');
              execSync('brew install --cask docker', { stdio: 'inherit' });
              installedSuccessfully = true;
            } else {
              logError('Homebrew is not installed. Unable to install Docker automatically.');
            }
          } else if (platform === 'linux') {
            installSpinner.stop('Downloading official Docker install script...');
            execSync('curl -fsSL https://get.docker.com -o get-docker.sh', { stdio: 'inherit' });
            console.log('Running Docker install script (this may request sudo permissions)...');
            execSync('sudo sh get-docker.sh', { stdio: 'inherit' });
            try {
              execSync('rm get-docker.sh', { stdio: 'ignore' });
            } catch (e) {}
            installedSuccessfully = true;
          } else {
            installSpinner.stop(`Unsupported platform: ${platform}`);
          }
        } catch (error) {
          logError(`Installation failed: ${error.message}`);
        }
      }
    }

    if (installedSuccessfully) {
      logSuccess('Docker has been installed successfully!');
      if (hasClack) {
        p.note(
          [
            'Docker is now installed. Please follow these steps to proceed:',
            '  1. Start Docker Desktop (on Windows/macOS) or ensure the Docker daemon service is running (on Linux).',
            '  2. Restart your terminal (or log out and back in) for environment variables / group changes to take effect.',
            '  3. Start the local development stack with:',
            `     ${pc.cyan('pnpm dev:full')}`
          ].join('\n'),
          'Post-Installation Steps'
        );
        p.outro(pc.green('Docker check complete: Success!'));
      } else {
        console.log(
          'Docker has been installed. Please:\n' +
          '  1. Start Docker / Docker Desktop.\n' +
          '  2. Restart your terminal/system.\n' +
          '  3. Run: pnpm dev:full\n'
        );
      }
      return;
    }

    if (hasClack) {
      p.note(
        [
          'Docker is required to run the local MinIO storage container.',
          'Without Docker, you will not be able to use the following commands:',
          `  - ${pc.bold('pnpm dev:full')} (starts MinIO + API + Dashboard)`,
          `  - ${pc.bold('pnpm dev:storage')} (starts MinIO only)`,
          '',
          'To install Docker manually, please visit: https://www.docker.com/get-started/',
          'Once installed and running, local development and testing will be fully enabled.'
        ].join('\n'),
        'Action Required'
      );
      p.outro(pc.yellow('Check completed: Docker not available'));
    } else {
      console.log(
        'Docker is required to run the local MinIO storage container.\n' +
        'Without Docker, you will not be able to run:\n' +
        '  - pnpm dev:full\n' +
        '  - pnpm dev:storage\n\n' +
        'Please install Docker: https://www.docker.com/get-started/\n'
      );
    }
    return;
  }

  let dockerRunning = false;
  try {
    execSync('docker info', { stdio: 'ignore' });
    dockerRunning = true;
  } catch (e) {
    // Docker is installed, but daemon is not running
  }

  if (!dockerRunning) {
    logWarn('Docker is installed, but the Docker daemon is NOT running.');
    if (hasClack) {
      p.note(
        [
          'The Docker service must be running to spin up local dev services.',
          'Please start Docker Desktop (or run your system\'s docker daemon) before running:',
          `  - ${pc.bold('pnpm dev:full')}`,
          `  - ${pc.bold('pnpm dev:storage')}`,
          '',
          'This is necessary for running BeechCMS locally and running the test suite.'
        ].join('\n'),
        'Action Required'
      );
      p.outro(pc.yellow('Check completed: Docker daemon not running'));
    } else {
      console.log(
        'The Docker service must be running to spin up local dev services.\n' +
        'Please start Docker Desktop (or your docker service) before running:\n' +
        '  - pnpm dev:full\n' +
        '  - pnpm dev:storage\n\n' +
        'This is necessary for running BeechCMS locally and running the test suite.\n'
      );
    }
    return;
  }

  logSuccess('Docker is installed and running successfully.');
  if (hasClack) {
    p.note(
      [
        'Your environment is fully prepared for local development and testing.',
        'You can start the local development stack with:',
        `  ${pc.cyan('pnpm dev:full')}`
      ].join('\n'),
      'Ready to Develop'
    );
    p.outro(pc.green('Docker check complete: Success!'));
  } else {
    console.log(
      'Your environment is fully prepared for local development and testing.\n' +
      'You can start the local development stack with:\n' +
      '  pnpm dev:full\n'
    );
  }
}

checkDocker().catch((err) => {
  console.error('Error running Docker check:', err);
});
