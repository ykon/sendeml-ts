// Copyright (c) Yuki Ono.
// Licensed under the MIT License.

import { BufReader } from "https://deno.land/std/io/bufio.ts";

const VERSION: string = "1.0";

const CR: number = "\r".charCodeAt(0);
const LF: number = "\n".charCodeAt(0);
const SPACE: number = " ".charCodeAt(0);
const HTAB: number = "\t".charCodeAt(0);
export const CRLF: string = "\r\n";

const DATE_BYTES = new TextEncoder().encode("Date:");
const MESSAGE_ID_BYTES = new TextEncoder().encode("Message-ID:");

export function isNotUpdate(updateDate: boolean, updateMessageId: boolean): boolean {
    return !updateDate && !updateMessageId;
}

export function findCrIndex(buf: Uint8Array, offset: number): number {
    return buf.indexOf(CR, offset);
}

export function findLfIndex(buf: Uint8Array, offset: number): number {
    return buf.indexOf(LF, offset);
}

export function findAllLfIndices(buf: Uint8Array): number[] {
    const indices = [];
    let offset = 0;
    while (true) {
        const idx = findLfIndex(buf, offset);
        if (idx === -1)
            return indices;

        indices.push(idx);
        offset = idx + 1;
    }
}


export function getRawLines(header: Uint8Array): Uint8Array[] {
    let offset = 0;
    return findAllLfIndices(header).concat(header.length - 1).map(i => {
        const line = header.slice(offset, i + 1);
        offset = i + 1;
        return line;
    });
}

export function concatBytes(bytesArray: Uint8Array[]): Uint8Array {
    const buf = new Uint8Array(bytesArray.reduce((acc, b) => acc + b.length, 0));
    let offset = 0;
    bytesArray.forEach(b => {
        buf.set(b, offset);
        offset += b.length;
    });
    return buf;
}

export function matchHeaderField(line: Uint8Array, header: Uint8Array): boolean {
    if (line.length < header.length)
        return false;

    for (let i = 0; i < header.length; i++) {
        if (header[i] !== line[i])
            return false;
    }

    return true;
}

export function isDateLine(line: Uint8Array): boolean {
    return matchHeaderField(line, DATE_BYTES);
}

export function isMessageIdLine(line: Uint8Array): boolean {
    return matchHeaderField(line, MESSAGE_ID_BYTES);
}

export function makeNowDateLine(): string {
    const lzero = (n: number): string => ('0' + n).slice(-2);

    const obj = new Date;
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][obj.getDay()];
    const date = lzero(obj.getDate());
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][obj.getMonth()];
    const year = obj.getFullYear();
    const hours = lzero(obj.getHours());
    const minutes = lzero(obj.getMinutes());
    const seconds = lzero(obj.getSeconds());

    const offset = (-obj.getTimezoneOffset());
    const timezone = lzero(offset / 60) + lzero(offset % 60);
    
    return `Date: ${day}, ${date} ${month} ${year} ${hours}:${minutes}:${seconds} +${timezone}${CRLF}`;
}

export function makeRandomMessageIdLine(): string {
    const s = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const length = 62;
    const randStr = [...Array(length)].map(() => s.charAt(Math.floor(Math.random() * s.length))).join('');
    return `Message-ID: <${randStr}>${CRLF}`;
}

export function isWsp(b: number): boolean {
    return b === SPACE || b === HTAB;
}

export function isFoldedLine(bytes: Uint8Array): boolean {
    return isWsp(bytes[0] ?? 0)
}

export function replaceHeader(header: Uint8Array, updateDate: boolean, updateMessageId: boolean): Uint8Array {
    if (isNotUpdate(updateDate, updateMessageId))
        return header;

    function removeFolding(lines: Uint8Array[], idx: number) {
        for (let i = idx; i < lines.length; i++) {
            if (isFoldedLine(lines[i]))
                lines[i] = new Uint8Array(0);
            else
                break;
        }
    }

    function replaceLine(lines: Uint8Array[], update: boolean, matchLine: (line: Uint8Array) => boolean, makeLine: () => string) {
        if (update) {
            const idx = lines.findIndex(matchLine);
            if (idx !== -1) {
                lines[idx] = (new TextEncoder()).encode(makeLine());
                removeFolding(lines, idx + 1);
            }
        }
    }

    const lines = getRawLines(header);
    replaceLine(lines, updateDate, isDateLine, makeNowDateLine);
    replaceLine(lines, updateMessageId, isMessageIdLine, makeRandomMessageIdLine);
    return concatBytes(lines);
}

const EMPTY_LINE: Uint8Array = Uint8Array.from([CR, LF, CR, LF]);

export function combineMail(header: Uint8Array, body: Uint8Array): Uint8Array {
    return concatBytes([header, EMPTY_LINE, body]);
}

export function findEmptyLine(fileBuf: Uint8Array): number {
    let offset = 0;
    while (true) {
        const idx = findCrIndex(fileBuf, offset);
        if (idx === -1 || (idx + 3) >= fileBuf.length)
            return -1;

        if (fileBuf[idx + 1] === LF && fileBuf[idx + 2] === CR && fileBuf[idx + 3] === LF)
            return idx;

        offset = idx + 1;
    }
}

export function splitMail(fileBuf: Uint8Array): {ok: boolean, res?: [Uint8Array, Uint8Array]} {
    const idx = findEmptyLine(fileBuf);
    if (idx === -1)
        return {ok: false};

    const header = fileBuf.slice(0, idx);
    const body = fileBuf.slice(idx + EMPTY_LINE.length, fileBuf.length);

    return {ok: true, res: [header, body]};
}

export function replaceMail(fileBuf: Uint8Array, updateDate: boolean, updateMessageId: boolean): {ok: boolean, res?: Uint8Array} {
    if (isNotUpdate(updateDate, updateMessageId))
        return {ok: true, res: fileBuf};

    const mail = splitMail(fileBuf);
    if (!mail.ok)
        return {ok: false};

    const [header, body] = mail.res!;
    const replHeader = replaceHeader(header, updateDate, updateMessageId);
    return {ok: true, res: combineMail(replHeader, body)};
}

function makeIdPrefix(id?: number) {
    return id ? `id: ${id}, ` : "";
}

type ErrorResult = {ok: boolean, msg?: string};
type AsyncErrorResult = Promise<ErrorResult>;

function makeError(msg: string): ErrorResult {
    return {ok: false, msg: msg};
}

async function sendMail(conn: Deno.Conn, file: string, updateDate: boolean, updateMessageId: boolean, id?: number): AsyncErrorResult {
    console.log(makeIdPrefix(id) + `send: ${file}`);

    const buf = replaceMail(await Deno.readFile(file), updateDate, updateMessageId);
    if (!buf.ok)
        return makeError("Invalid mail");

    await Deno.writeAll(conn, buf.res!);
    return {ok: true};
}

export function makeJsonSample(): string {
    return `{
    "smtpHost": "172.16.3.151",
    "smtpPort": 25,
    "fromAddress": "a001@ah62.example.jp",
    "toAddress": [
        "a001@ah62.example.jp",
        "a002@ah62.example.jp",
        "a003@ah62.example.jp"
    ],
    "emlFile": [
        "test1.eml",
        "test2.eml",
        "test3.eml"
    ],
    "updateDate": true,
    "updateMessageId": true,
    "useParallel": false
}`;
}

function printUsage(): void {
    console.log("Usage: {self} json_file ...");
    console.log("...")

    console.log("json_file sample:");
    console.log(makeJsonSample());
}

function printVersion(): void {
    console.log(`SendEML / Version: ${VERSION}`);
}

export function getSettingsFromText(text: string): {ok: boolean, json?: any, msg?: string} {
    try {
        return {ok: true, json: JSON.parse(text)}
    } catch (e) {
        return makeError(e.message);
    }
}

interface Settings {
    smtpHost: string;
    smtpPort: number;
    fromAddress: string;
    toAddress: string[];
    emlFile: string[];
    updateDate: boolean;
    updateMessageId: boolean;
    useParallel: boolean;
}

export function mapSettings(json: any): Settings {
    return {
        smtpHost: json.smtpHost,
        smtpPort: json.smtpPort,
        fromAddress: json.fromAddress,
        toAddress: json.toAddress,
        emlFile: json.emlFile,
        updateDate: json.updateDate ?? true,
        updateMessageId: json.updateMessageId ?? true,
        useParallel: json.useParallel ?? false
    };
}

async function getSettings(jsonFile: string): Promise<{ok: boolean, json?: any, msg?: string}> {
    return getSettingsFromText(await Deno.readTextFile(jsonFile));
}

export function checkJsonValue(json: any, name: string, type: string): ErrorResult {
    if (name in json) {
        if (typeof json[name] !== type)
            return makeError(`${name}: Invalid type: ${json[name]}`);
    }

    return {ok: true};
}

export function checkJsonArrayValue(json: any, name: string, type: string): ErrorResult {
    if (name in json) {
        if (!Array.isArray(json[name]))
            return makeError(`${name}: Invalid type (array): ${json[name]}`);

        const elm = json[name].find((v: any) => typeof v !== type);
        if (elm)
            return makeError(`${name}: Invalid type (element): ${elm}`);
    }

    return {ok: true};
}

export function checkSettings(json: any): ErrorResult {
    const names = ["smtpHost", "smtpPort", "fromAddress", "toAddress", "emlFile"];
    const key = names.find(n => !(n in json));
    if (key)
        return makeError(`${key} key does not exist`);

    const checks = [
        checkJsonValue(json, "smtpHost", "string"),
        checkJsonValue(json, "smtpPort", "number"),
        checkJsonValue(json, "fromAddress", "string"),
        checkJsonArrayValue(json, "toAddress", "string"),
        checkJsonArrayValue(json, "emlFile", "string"),
        checkJsonValue(json, "updateDate", "boolean"),
        checkJsonValue(json, "updateMessageId", "boolean"),
        checkJsonValue(json, "useParallel", "boolean")
    ];

    const res = checks.find(c => !c.ok);
    return res ? makeError(res.msg!) : {ok: true};
}

export function replaceCrlfDot(cmd: string): string {
    return cmd === `${CRLF}.` ? "<CRLF>." : cmd;
}

async function sendLine(conn: Deno.Conn, cmd: string, id?: number): Promise<void> {
    console.log(makeIdPrefix(id) + "send: " + replaceCrlfDot(cmd));

    const buf = new TextEncoder().encode(cmd + CRLF);
    await Deno.writeAll(conn, buf);
}

const LAST_REPLY_REGEX = new RegExp(/^\d{3} .+/);

export function isLastReply(line: string): boolean {
    return LAST_REPLY_REGEX.test(line);
}

export function isPositiveReply(line: string): boolean {
    const first = line[0] ?? "";
    return first === "2" || first === "3";
}

type CmdResult = AsyncErrorResult;

async function recvLine(reader: BufReader, id?: number): CmdResult {
    while (true) {
        const lineRes = await reader.readLine();
        if (lineRes === null)
            return makeError("Connection closed by foreign host");

        const lineStr = new TextDecoder().decode(lineRes.line);
        console.log(makeIdPrefix(id) + `recv: ${lineStr}`);

        if (isLastReply(lineStr)) {
            if (isPositiveReply(lineStr))
                return {ok: true, msg: lineStr};

            return makeError(lineStr);
        }
    }
}

export type SendCmd = (cmd: string) => CmdResult;

function makeSendCmd(conn: Deno.Conn, reader: BufReader, id?: number): SendCmd {
    return async (cmd: string) => {
        await sendLine(conn, cmd, id);
        return await recvLine(reader, id);
    };
}

export async function sendHello(send: SendCmd): CmdResult {
    return await send("EHLO localhost");
}

export async function sendQuit(send: SendCmd): CmdResult {
    return await send("QUIT");
}

export async function sendRset(send: SendCmd): CmdResult {
    return await send("RSET");
}

export async function sendFrom(send: SendCmd, fromAddr: string): CmdResult {
    return await send(`MAIL FROM: <${fromAddr}>`)
}

export async function sendRcptTo(send: SendCmd, toAddrs: string[]): Promise<void> {
    for (let addr of toAddrs)
        await send(`RCPT TO: <${addr}>`);
}

export async function sendData(send: SendCmd): CmdResult {
    return await send("DATA");
}

export async function sendCrlfDot(send: SendCmd): CmdResult {
    return await send(`${CRLF}.`);
}

async function isFile(path: string): Promise<boolean> {
    return (await Deno.stat(path)).isFile;
}

async function sendMessages(settings: Settings, emlFiles: string[], id?: number): AsyncErrorResult {
    const conn = await Deno.connect({hostname: settings.smtpHost, port: settings.smtpPort});

    try {
        const reader = new BufReader(conn);
        const send = makeSendCmd(conn, reader, id);
    
        await recvLine(reader, id);
        await sendHello(send)

        let reset = false;
        for (let file of emlFiles) {
            if (!(await isFile(file))) {
                console.log(`${file}: EML file does not exist`);
                continue;
            }

            if (reset) {
                console.log("---");
                await sendRset(send);
            }

            await sendFrom(send, settings.fromAddress);
            await sendRcptTo(send, settings.toAddress);
            await sendData(send);

            const res = await sendMail(conn, file, settings.updateDate, settings.updateMessageId, id);
            if (!res.ok)
                return makeError(`${file}: ${res.msg!}`);

            await sendCrlfDot(send);
            reset = true;
        }
        await sendQuit(send);
        return {ok: true};

    } finally {
        Deno.close(conn.rid);
    }
}

export async function procJsonFile(jsonFile: string): AsyncErrorResult {
    if (!(await isFile(jsonFile)))
        return makeError("Json file does not exist");

    const jsonRes = await getSettings(jsonFile);
    if (!jsonRes.ok)
        return jsonRes;

    const json = jsonRes.json!;
    const checkRes = checkSettings(json);
    if (!checkRes.ok)
        return checkRes;

    const settings = mapSettings(json);

    if (settings.useParallel && settings.emlFile.length > 1) {
        let id = 1;
        settings.emlFile.forEach(f => {
            sendMessages(settings, [f], id).then(res => {
                if (!res.ok)
                    console.log(`error: ${jsonFile}: ${res.msg!}`);
            });
            id += 1;
        });
    } else {
        return await sendMessages(settings, settings.emlFile)
    }

    return {ok: true};
}

async function main(): Promise<void> {
    if (Deno.args.length === 0) {
        printUsage();
        return;
    }

    if (Deno.args[0] === "--version") {
        printVersion();
        return;
    }

    for (let jsonFile of Deno.args) {
        const res = await procJsonFile(jsonFile);
        if (!res.ok)
            console.log(`error: ${jsonFile}: ${res.msg!}`);
    }
}

if (import.meta.main) {
    main();
}