class JgFilesBlocks {
    getInfo() {
        return {
            id: 'jgFiles',
            name: 'Files',
            color1: '#ffbb00',
            color2: '#ffaa00',
            blocks: [
                {
                    opcode: 'isFileReaderSupported',
                    text: 'can files be used?',
                    disableMonitor: false,
                    blockType: Scratch.BlockType.BOOLEAN
                },
                {
                    opcode: 'askUserForFile',
                    text: 'ask user for a file',
                    disableMonitor: true,
                    blockType: Scratch.BlockType.REPORTER
                },
                {
                    opcode: 'askUserForFileOfType',
                    text: 'ask user for a file of type [FILE_TYPE]',
                    disableMonitor: true,
                    blockType: Scratch.BlockType.REPORTER,
                    arguments: {
                        FILE_TYPE: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: 'any'
                        }
                    }
                },
                {
                    opcode: 'downloadFile',
                    text: 'download content [FILE_CONTENT] as file name [FILE_NAME]',
                    blockType: Scratch.BlockType.COMMAND,
                    arguments: {
                        FILE_CONTENT: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: 'Hello!'
                        },
                        FILE_NAME: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: 'text.txt'
                        }
                    }
                }
            ]
        };
    }
    isFileReaderSupported() {
        return (window.FileReader != null);
    }
    __askUserForFile(acceptTypes) {
        return new Promise((resolve, _) => {
            const fileReader = new FileReader();
            fileReader.onload = (e) => {
                resolve(e.target.result);
            }
            const input = document.createElement("input");
            input.type = "file";
            if (acceptTypes != null) {
                input.accept = acceptTypes
            }
            input.style.display = "none";
            document.body.append(input);
            input.onchange = () => {
                const file = input.files[0];
                if (!file) {
                    resolve("");
                    return;
                } else {
                    fileReader.readAsText(file);
                }
                input.remove();
            }
            input.onblur = () => {
                input.onchange();
            }
            input.focus();
            input.click();
        })
    }
    askUserForFile() {
        return this.__askUserForFile(null);
    }
    askUserForFileOfType(args) {
        const fileTypesAllowed = [];
        const input = String(args.FILE_TYPE).toLowerCase().replace(/.,/gmi, "");
        if (input == "any")
            return this.__askUserForFile(null);
        input.split(" ").forEach(type => {
            fileTypesAllowed.push("." + type);
        })
        return this.__askUserForFile(fileTypesAllowed.join(","));
    }
    downloadFile(args) {
        let content = "";
        let fileName = "text.txt";
        content = String(args.FILE_CONTENT);
        fileName = String(args.FILE_NAME);
        const blob = new Blob([content]);
        const a = document.createElement("a");
        a.style.display = "none";
        document.body.append(a);
        const url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    }
}
Scratch.extensions.register(new JgFilesBlocks());
