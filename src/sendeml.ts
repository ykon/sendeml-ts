// Copyright (c) Yuki Ono.
// Licensed under the MIT License.

import { BufReader } from "https://deno.land/std/io/bufio.ts";

const VERSION: string = "1.0";

export const CR: number = "\r".charCodeAt(0);
export const LF: number = "\n".charCodeAt(0);
const SPACE: number = " ".charCodeAt(0);
const HTAB: number = "\t".charCodeAt(0);
export const CRLF: string = "\r\n";

const DATE_BYTES = new TextEncoder().encode("Date:");
const MESSAGE_ID_BYTES = new TextEncoder().encode("Message-ID:");

export function isNotUpdate(updateDate: boolean, updateMessageId: boolean): boolean {
    return !updateDate && !updateMessageId;
}

export function findCr(buf: Uint8Array, offset: number): number {
    return buf.indexOf(CR, offset);
}

export function findLf(buf: Uint8Array, offset: number): number {
    return buf.indexOf(LF, offset);
}

export function findAllLf(buf: Uint8Array): number[] {
    const indices = [];
    let offset = 0;
    while (true) {
        const idx = findLf(buf, offset);
        if (idx === -1)
            return indices;

        indices.push(idx);
        offset = idx + 1;
    }
}

type Lines = Uint8Array[];

export function getLines(bytes: Uint8Array): Lines {
    let offset = 0;
    return findAllLf(bytes).concat(bytes.length - 1).map(i => {
        const line = bytes.slice(offset, i + 1);
        offset = i + 1;
        return line;
    });
}

export function concatBytes(bytesArray: Lines): Uint8Array {
    const buf = new Uint8Array(bytesArray.reduce((acc, b) => acc + b.length, 0));
    let offset = 0;
    bytesArray.forEach(b => {
        buf.set(b, offset);
        offset += b.length;
    });
    return buf;
}

export function matchHeader(line: Uint8Array, header: Uint8Array): boolean {
    if (header.length === 0)
        throw new Error("header is empty");

    if (line.length < header.length)
        return false;

    return header.every((v, i) => v === line[i]);
}

export function isDateLine(line: Uint8Array): boolean {
    return matchHeader(line, DATE_BYTES);
}

export function isMessageIdLine(line: Uint8Array): boolean {
    return matchHeader(line, MESSAGE_ID_BYTES);
}

// 0 => 00, 1 => 01, 10 => 10
export function padZero2(n: number): string {
    if (n < 0 || n > 99)
        throw new Error("invalid number");

    return ('0' + n).slice(-2);
}

export function makeTimeZoneOffset(min: number): string {
    if (min < -840 || min > 720)
        throw new Error("invalid number");

    const first = padZero2(Math.floor(Math.abs(min) / 60));
    const last = padZero2(Math.abs(min) % 60);
    return (min <= 0 ? "+" : "-") + first + last;
}

export function makeNowDateLine(): string {
    const obj = new Date;
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][obj.getDay()];
    const date = padZero2(obj.getDate());
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][obj.getMonth()];
    const year = obj.getFullYear();
    const hours = padZero2(obj.getHours());
    const minutes = padZero2(obj.getMinutes());
    const seconds = padZero2(obj.getSeconds());
    const zone = makeTimeZoneOffset(obj.getTimezoneOffset());
    
    return `Date: ${day}, ${date} ${month} ${year} ${hours}:${minutes}:${seconds} ${zone}${CRLF}`;
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

export function dropFoldedLine(lines: Lines): Lines {
    const idx = lines.findIndex(l => !isFoldedLine(l));
    return (idx <= 0) ? lines : lines.slice(idx);
}

function replaceLine(lines: Lines, matchLine: (line: Uint8Array) => boolean, makeLine: () => string): Lines {
    const idx = lines.findIndex(matchLine);
    if (idx === -1)
        return lines;

    const p1 = lines.slice(0, idx);
    const p2 = [new TextEncoder().encode(makeLine())];
    const p3 = dropFoldedLine(lines.slice(idx + 1));

    return p1.concat(p2, p3);
}

export function replaceDateLine(lines: Lines): Lines {
    return replaceLine(lines, isDateLine, makeNowDateLine);
}

export function replaceMessageIdLine(lines: Lines): Lines {
    return replaceLine(lines, isMessageIdLine, makeRandomMessageIdLine);
}

export function replaceHeader(header: Uint8Array, updateDate: boolean, updateMessageId: boolean): Uint8Array {
    function replace(): Lines {
        const lines = getLines(header);
        const [d, m] = [updateDate, updateMessageId];

        if (d && m) return replaceMessageIdLine(replaceDateLine(lines));
        if (d && !m) return replaceDateLine(lines);
        if (!d && m) return replaceMessageIdLine(lines);

        return lines;
    }

    return concatBytes(replace());
}

const EMPTY_LINE: Uint8Array = Uint8Array.from([CR, LF, CR, LF]);

export function combineMail(header: Uint8Array, body: Uint8Array): Uint8Array {
    return concatBytes([header, EMPTY_LINE, body]);
}

export function hasNextLfCrLf(bytes: Uint8Array, idx: number): boolean {
    if (bytes.length < (idx + 4))
        return false;

    const next = [LF, CR, LF];
    return next.every((v, i) => v === bytes[i + idx + 1]);
}

export function findEmptyLine(bytes: Uint8Array): number {
    let offset = 0;
    while (true) {
        const idx = findCr(bytes, offset);
        if (idx === -1)
            return -1;
        if (hasNextLfCrLf(bytes, idx))
            return idx;

        offset = idx + 1;
    }
}

export function splitMail(bytes: Uint8Array): {ok: boolean, res?: [Uint8Array, Uint8Array]} {
    const idx = findEmptyLine(bytes);
    if (idx === -1)
        return {ok: false};

    const header = bytes.slice(0, idx);
    const body = bytes.slice(idx + EMPTY_LINE.length, bytes.length);

    return {ok: true, res: [header, body]};
}

export function replaceMail(bytes: Uint8Array, updateDate: boolean, updateMessageId: boolean): {ok: boolean, res?: Uint8Array} {
    if (isNotUpdate(updateDate, updateMessageId))
        return {ok: true, res: bytes};

    const mail = splitMail(bytes);
    if (!mail.ok)
        return {ok: false};

    const [header, body] = mail.res!;
    const replHeader = replaceHeader(header, updateDate, updateMessageId);
    return {ok: true, res: combineMail(replHeader, body)}
}

function makeIdPrefix(id?: number) {
    return id ? `id: ${id}, ` : "";
}

export type ErrorResult = {ok: boolean, msg?: string};
export type AsyncErrorResult = Promise<ErrorResult>;

function makeError(msg: string): ErrorResult {
    return {ok: false, msg: msg};
}

async function sendMail(conn: Deno.Conn, file: string, updateDate: boolean, updateMessageId: boolean, id?: number): Promise<void> {
    console.log(makeIdPrefix(id) + `send: ${file}`);

    const mail = await Deno.readFile(file);
    const replMail = replaceMail(mail, updateDate, updateMessageId);
    if (!replMail.ok)
        console.log("error: Invalid mail: Disable updateDate, updateMessageId");

    await Deno.writeAll(conn, replMail.res ?? mail);
}

export function makeJsonSample(): string {
    return `{
    "smtpHost": "172.16.3.151",
    "smtpPort": 25,
    "fromAddress": "a001@ah62.example.jp",
    "toAddresses": [
        "a001@ah62.example.jp",
        "a002@ah62.example.jp",
        "a003@ah62.example.jp"
    ],
    "emlFiles": [
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
    toAddresses: string[];
    emlFiles: string[];
    updateDate: boolean;
    updateMessageId: boolean;
    useParallel: boolean;
}

export function mapSettings(json: any): Settings {
    return {
        smtpHost: json.smtpHost,
        smtpPort: json.smtpPort,
        fromAddress: json.fromAddress,
        toAddresses: json.toAddresses,
        emlFiles: json.emlFiles,
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
    const names = ["smtpHost", "smtpPort", "fromAddress", "toAddresses", "emlFiles"];
    const key = names.find(n => !(n in json));
    if (key)
        return makeError(`${key} key does not exist`);

    const checks = [
        checkJsonValue(json, "smtpHost", "string"),
        checkJsonValue(json, "smtpPort", "number"),
        checkJsonValue(json, "fromAddress", "string"),
        checkJsonArrayValue(json, "toAddresses", "string"),
        checkJsonArrayValue(json, "emlFiles", "string"),
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
            await sendRcptTo(send, settings.toAddresses);
            await sendData(send);
            await sendMail(conn, file, settings.updateDate, settings.updateMessageId, id);
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

    if (settings.useParallel && settings.emlFiles.length > 1) {
        let id = 1;
        settings.emlFiles.forEach(f => {
            sendMessages(settings, [f], id).then(res => {
                if (!res.ok)
                    console.log(`error: ${jsonFile}: ${res.msg!}`);
            });
            id += 1;
        });
    } else {
        return await sendMessages(settings, settings.emlFiles)
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