
# HDL Copilot
## Note: Metalware no longer actively maintains this extension. You can find the source code for the backend binaries [here](https://github.com/metalware-inc/hdl-copilot-backend).

Place the binary for your system in the `bin` folder. One of the following is required:

- `bin/linux/hdl_copilot_server_x86-64_packed`
- `bin/linux/hdl_copilot_server_aarch64_packed`
- `bin/win/hdl_copilot_server.exe`
- `bin/macos/hdl_copilot_server`

Instructions how to build the backend can be found [here](https://github.com/metalware-inc/hdl-copilot-backend).

##

#### [Homepage](https://www.metalware.io/) | [Documentation](https://docs.metalware.io/hdl-copilot/) | [Changelog](https://marketplace.visualstudio.com/items/metalware-inc.hdl-copilot/changelog) | [Support](https://discord.gg/gntuHgpfDH)

Blazing-fast linting, formatting, go-to-definition, and code completion for (System) Verilog.

Read our full documentation and FAQs [here](https://docs.metalware.io/hdl-copilot/)
## Requirements

* **Linux (glibc >= 2.31, x86-64, aarch64) and Windows x64**
* Currently supports **Verilog / SystemVerilog** only (IEEE 1800-2017)

## Autocomplete & Lint

Autocomplete support for 30+ SystemVerilog constructs and 1000+ SystemVerilog compliance rules.

<img src="https://github.com/metalware-inc/public-assets/blob/main/hdl-copilot/vscode/images/hdl_copilot_lowres autcomplete_v5.png?raw=true">

## External library integration (UVM)

From the command menu, select **HDL Copilot: Open Preferences** and add folder paths to the Library Includes field..

<img src="https://github.com/metalware-inc/public-assets/blob/main/hdl-copilot/vscode/images/hdl_copilot_lowres_third_party_uvm_v6.png?raw=true">

## Project setup

From the command menu, select **HDL Copilot: Set Verilog (SystemVerilog) project**.

<img src="https://github.com/metalware-inc/public-assets/blob/main/hdl-copilot/vscode/images/hdl_copilot_easy_setup_low_res_v1.png?raw=true">

## Excluding files from project

Right-click the file in explorer and select **HDL Copilot: Exclude from Compilation.

![dep-1](https://github.com/metalware-inc/public-assets/blob/main/hdl-copilot/vscode/images/hdl_copilot_exclude_from_compilation_v1.png?raw=true)

## Free Licensing

Upon installing, you will see the following notification:
![setup-1](https://github.com/metalware-inc/public-assets/blob/main/hdl-copilot/vscode/images/license-not-found.png?raw=true)

Click on "Get a free license" or go [here](https://license.metalware.io/) (takes <1 min).

To set the key, select **HDL Copilot: Set License** from the command bar (Ctrl+Shift+P).

![setup-2](https://github.com/metalware-inc/public-assets/blob/main/hdl-copilot/vscode/images/set-license.png?raw=true)

## Telemetry

To improve our product and performance, we gather a limited scope of telemetry data.  We **do not** collect any data or code specific to your company.

**Information collected**

- MAC and IP addresses to track per-license usage.
- Operating system details to optimize compatibility and user experience.
- The number of warning or error suppressions.
- The number of includes.
- Number of successful project setups.
- Errors related to the backend.

**What is NOT collected**

- Any form of code, including RTL and behavioral.
- File paths, ensuring complete privacy and security of your project structure and data.

## Support, Feedback, Community

We are actively developing the extension. Please report any issues or feature requests in [our active Discord community](https://discord.gg/gntuHgpfDH) or email us at [contact@metalware.io](mailto:contact@metalware.io).
