// Copyright (c) Yuki Ono.
// Licensed under the MIT License.

import {
    assert,
    assertEquals,
    assertNotEquals,
    assertThrows
} from "https://deno.land/std/testing/asserts.ts";

import * as seml from "./sendeml.ts";

declare global {
    interface String {
        toBytes(): Uint8Array;
    }
    interface Uint8Array {
        toUtf8String(): string;
    }
}

String.prototype.toBytes = function(this: string): Uint8Array {
    return new TextEncoder().encode(this)
}

Uint8Array.prototype.toUtf8String = function(this: Uint8Array): string {
    return new TextDecoder().decode(this);
}

function assertTrue(actual: boolean): void {
    assertEquals(actual, true);
}

function assertFalse(actual: boolean): void {
    assertEquals(actual, false);
}

Deno.test("matchHeader", () => {
    const f = (s1: string, s2: string) => seml.matchHeader(s1.toBytes(), s2.toBytes());

    assertTrue(f("Test:", "Test:"));
    assertTrue(f("Test:   ", "Test:"));
    assertTrue(f("Test: xxx", "Test:"));

    assertFalse(f("", "Test:"));
    assertFalse(f("T", "Test:"));
    assertFalse(f("Test", "Test:"));
    assertFalse(f("X-Test:", "Test:"));

    assertThrows(() => {
        f("Test: XXX", "")
    }, Error);
});

Deno.test("isDateLine", () => {
    const f = (s: string) => seml.isDateLine(s.toBytes())

    assertTrue(f("Date: xxx"));
    assertTrue(f("Date:xxx"));
    assertTrue(f("Date:"));
    assertTrue(f("Date:   "));

    assertFalse(f(""));
    assertFalse(f("Date"));
    assertFalse(f("xxx: Date"));
    assertFalse(f("X-Date: xxx"));
});

Deno.test("isMessageIdLine", () => {
    const f = (s: string) => seml.isMessageIdLine(s.toBytes())

    assertTrue(f("Message-ID: xxx"));
    assertTrue(f("Message-ID:xxx"));
    assertTrue(f("Message-ID:"));
    assertTrue(f("Message-ID:   "));

    assertFalse(f(""));
    assertFalse(f("Message-ID"));
    assertFalse(f("xxx: Message-ID"));
    assertFalse(f("X-Message-ID: xxx"));
});
  
Deno.test("isNotUpdate", () => {;
    const f = seml.isNotUpdate;

    assertTrue(f(false, false));

    assertFalse(f(true, true));
    assertFalse(f(true, false));
    assertFalse(f(false, true));
});

Deno.test("makeDateLine", () => {
    const line = seml.makeNowDateLine();
    assert(line.startsWith("Date:"));
    assert(line.endsWith(seml.CRLF));
    assert(line.length <= 80);
});

Deno.test("padZero2", () => {
    const f = seml.padZero2;

    assertEquals(f(0), "00");
    assertEquals(f(1), "01");
    assertEquals(f(10), "10");
    assertEquals(f(99), "99");

    assertThrows(() => f(-1), Error);
    assertThrows(() => f(100), Error);
});

Deno.test("makeTimeZoneOffset", () => {
    const f = seml.makeTimeZoneOffset;

    assertEquals(f(-840), "+1400");
    assertEquals(f(-540), "+0900");
    assertEquals(f(-480), "+0800");
    assertEquals(f(0), "+0000")

    assertEquals(f(720), "-1200")
    assertEquals(f(540), "-0900");
    assertEquals(f(480), "-0800");
    assertEquals(f(1), "-0001");

    assertThrows(() => f(-841), Error);
    assertThrows(() => f(721), Error);
});

Deno.test("makeRandomMessageIdLine", () => {
    const line = seml.makeRandomMessageIdLine();
    assert(line.startsWith("Message-ID:"));
    assert(line.endsWith(seml.CRLF));
    assertEquals(line.length, 78);
});

function lfToCRLF(text: string): string {
    return text.replace(/\n/g, "\r\n");
}

function makeSimpleMailText(): string {
    const text = `From: a001 <a001@ah62.example.jp>
Subject: test
To: a002@ah62.example.jp
Message-ID: <b0e564a5-4f70-761a-e103-70119d1bcb32@ah62.example.jp>
Date: Sun, 26 Jul 2020 22:01:37 +0900
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:78.0) Gecko/20100101
 Thunderbird/78.0.1
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8; format=flowed
Content-Transfer-Encoding: 7bit
Content-Language: en-US

test`;
    return lfToCRLF(text);
}

function makeSimpleMail(): Uint8Array {
    return makeSimpleMailText().toBytes();
}

function makeInvalidMail(): Uint8Array {
    return makeSimpleMailText().replace("\r\n\r\n", "").toBytes();
}

function makeFoldedMail(): Uint8Array {
    const text = `From: a001 <a001@ah62.example.jp>
Subject: test
To: a002@ah62.example.jp
Message-ID:
 <b0e564a5-4f70-761a-e103-70119d1bcb32@ah62.example.jp>
Date:
 Sun, 26 Jul 2020
 22:01:37 +0900
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:78.0) Gecko/20100101
 Thunderbird/78.0.1
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8; format=flowed
Content-Transfer-Encoding: 7bit
Content-Language: en-US

test`;
    return lfToCRLF(text).toBytes();
}

function makeFoldedEndDate(): Uint8Array {
    const text = `From: a001 <a001@ah62.example.jp>
Subject: test
To: a002@ah62.example.jp
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:78.0) Gecko/20100101
 Thunderbird/78.0.1
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8; format=flowed
Content-Transfer-Encoding: 7bit
Content-Language: en-US
Message-ID:
 <b0e564a5-4f70-761a-e103-70119d1bcb32@ah62.example.jp>
Date:
 Sun, 26 Jul 2020
 22:01:37 +0900
`
    return lfToCRLF(text).toBytes();
}

function makeFoldedEndMessageId(): Uint8Array {
    const text = `From: a001 <a001@ah62.example.jp>
Subject: test
To: a002@ah62.example.jp
Date:
 Sun, 26 Jul 2020
 22:01:37 +0900
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:78.0) Gecko/20100101
 Thunderbird/78.0.1
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8; format=flowed
Content-Transfer-Encoding: 7bit
Content-Language: en-US
Message-ID:
 <b0e564a5-4f70-761a-e103-70119d1bcb32@ah62.example.jp>
`
    return lfToCRLF(text).toBytes();
}

function getHeaderLine(header: Uint8Array, name: string): string {
    const headerStr = header.toUtf8String();
    const re = new RegExp(name + ":[\\s\\S]+?\\r\\n(?=([^ \\t]|$))");
    return headerStr.match(re)![0]
}

function getDateLine(header: Uint8Array): string {
    return getHeaderLine(header, "Date");
}

function getMessageIdLine(header: Uint8Array): string {
    return getHeaderLine(header, "Message-ID");
}

Deno.test("getHeaderLine", () => {
    const mail = makeSimpleMail();
    assertEquals(getDateLine(mail), "Date: Sun, 26 Jul 2020 22:01:37 +0900\r\n");
    assertEquals(getMessageIdLine(mail), "Message-ID: <b0e564a5-4f70-761a-e103-70119d1bcb32@ah62.example.jp>\r\n");

    const fMail = makeFoldedMail();
    assertEquals(getDateLine(fMail), "Date:\r\n Sun, 26 Jul 2020\r\n 22:01:37 +0900\r\n");
    assertEquals(getMessageIdLine(fMail), "Message-ID:\r\n <b0e564a5-4f70-761a-e103-70119d1bcb32@ah62.example.jp>\r\n");

    const eDate = makeFoldedEndDate();
    assertEquals(getDateLine(eDate), "Date:\r\n Sun, 26 Jul 2020\r\n 22:01:37 +0900\r\n");

    const eMessageId = makeFoldedEndMessageId();
    assertEquals(getMessageIdLine(eMessageId), "Message-ID:\r\n <b0e564a5-4f70-761a-e103-70119d1bcb32@ah62.example.jp>\r\n");
});

Deno.test("findCr", () => {
    const f = seml.findCr;

    const mail = makeSimpleMail();
    assertEquals(f(mail, 0), 33);
    assertEquals(f(mail, 34), 48);
    assertEquals(f(mail, 58), 74);
});

Deno.test("findLf", () => {
    const f = seml.findLf;

    const mail = makeSimpleMail();
    assertEquals(f(mail, 0), 34);
    assertEquals(f(mail, 35), 49);
    assertEquals(f(mail, 59), 75);
});

Deno.test("findAllLf", () => {
    const mail = makeSimpleMail();
    const indices = seml.findAllLf(mail);

    assertEquals(indices[0], 34);
    assertEquals(indices[1], 49);
    assertEquals(indices[2], 75);

    assertEquals(indices[indices.length - 3], 390);
    assertEquals(indices[indices.length - 2], 415);
    assertEquals(indices[indices.length - 1], 417);
});

Deno.test("getLines", () => {
    const mail = makeSimpleMail();
    const lines = seml.getLines(mail);

    assertEquals(lines.length, 13);
    assertEquals(lines[0].toUtf8String(), "From: a001 <a001@ah62.example.jp>\r\n");
    assertEquals(lines[1].toUtf8String(), "Subject: test\r\n");
    assertEquals(lines[2].toUtf8String(), "To: a002@ah62.example.jp\r\n");

    assertEquals(lines[lines.length - 3].toUtf8String(), "Content-Language: en-US\r\n");
    assertEquals(lines[lines.length - 2].toUtf8String(), "\r\n");
    assertEquals(lines[lines.length - 1].toUtf8String(), "test");
});

Deno.test("isWsp", () => {
    const f = (s: string) => seml.isWsp(s.charCodeAt(0));

    assertTrue(f(" "));
    assertTrue(f("\t"));

    assertFalse(f("\0"));
    assertFalse(f("a"));
    assertFalse(f("b"));
});

Deno.test("isFoldedLine", () => {
    const f = (...ss: string[]): boolean =>
        seml.isFoldedLine(Uint8Array.from(ss.map(s => s.charCodeAt(0))))

    assertTrue(f(" ", "a", "b"));
    assertTrue(f("\t", "a", "b"));

    assertFalse(f("\0", "a", "b"));
    assertFalse(f("a", "a", " "));
    assertFalse(f("b", "a", "\t"));
});

Deno.test("concatBytes", () => {
    const mail = makeSimpleMail();
    const lines = seml.getLines(mail);
    const newMail = seml.concatBytes(lines);
    assertEquals(newMail, mail);
});

Deno.test("replaceHeader", () => {
    const f = seml.replaceHeader;

    const mail = makeSimpleMail();
    const dateLine = getDateLine(mail);
    const midLine = getMessageIdLine(mail);

    const rHeaderNo = f(mail, false, false);
    assertEquals(rHeaderNo, mail);

    const rHeader = f(mail, true, true);
    assertNotEquals(rHeader, mail);

    const replace = (header: Uint8Array, updateDate: boolean, updateMessageId: boolean) => {
        const rHeader = f(header, updateDate, updateMessageId);
        return [getDateLine(rHeader), getMessageIdLine(rHeader)];
    };

    const [rDateLine, rMidLine] = replace(mail, true, true);
    assertNotEquals(rDateLine, dateLine);
    assertNotEquals(rMidLine, midLine);

    const [rDateLine2, rMidLine2] = replace(mail, true, false);
    assertNotEquals(rDateLine2, dateLine);
    assertEquals(rMidLine2, midLine);

    const [rDateLine3, rMidLine3] = replace(mail, false, true);
    assertEquals(rDateLine3, dateLine);
    assertNotEquals(rMidLine3, midLine);

    const fMail = makeFoldedMail();
    const [fDateLine, fMidLine] = replace(fMail, true, true);
    assertEquals([...fDateLine].filter(c => c == "\n").length, 1);
    assertEquals([...fMidLine].filter(c => c == "\n").length, 1);
});

const CR = seml.CR;
const LF = seml.LF;

Deno.test("hasNextLfCrLf", () => {
    const f = (a: number[], n: number) => seml.hasNextLfCrLf(Uint8Array.of(...a), n);
    const zero = "\0".charCodeAt(0);

    assertTrue(f([CR, LF, CR, LF], 0));
    assertTrue(f([zero, CR, LF, CR, LF], 1));

    assertFalse(f([CR, LF, CR, LF], 1));
    assertFalse(f([CR, LF, CR, zero], 0));
    assertFalse(f([CR, LF, CR, LF, zero], 1));
});

Deno.test("findEmptyLine", () => {
    const f = seml.findEmptyLine;

    const mail = makeSimpleMail();
    assertEquals(f(mail), 414);

    const invalidMail = makeInvalidMail();
    assertEquals(f(invalidMail), -1);
});

Deno.test("splitMail", () => {
    const f = seml.splitMail;

    const mail = makeSimpleMail();
    const headerBody = f(mail);
    assertTrue(headerBody.ok);

    const [header, body] = headerBody.res!;
    assertEquals(header, mail.slice(0, 414));
    assertEquals(body, mail.slice(414 + 4));

    const invalidMail = makeInvalidMail();
    assertFalse(f(invalidMail).ok);
});

Deno.test("combineMail", () => {
    const mail = makeSimpleMail();
    const [header, body] = seml.splitMail(mail).res!;
    const newMail = seml.combineMail(header, body);
    assertEquals(newMail, mail);
});

Deno.test("dropFoldedLine", () => {
    const f = seml.dropFoldedLine;

    const fMail = makeFoldedMail();
    const lines = seml.getLines(fMail);
    assertEquals(f(lines), lines);

    const f_lines = lines.slice(6);
    assert(f_lines[0].toUtf8String().startsWith(" Sun,"));
    const d_lines = f(f_lines);
    assert(d_lines[0].toUtf8String().startsWith("User-Agent:"));
});

Deno.test("replaceDateLine", () => {
    const fMail = makeFoldedMail();
    const lines = seml.getLines(fMail);
    const newLines = seml.replaceDateLine(lines);
    assertNotEquals(newLines, lines);

    const newMail = seml.concatBytes(newLines);
    assertNotEquals(newMail, fMail);
    assertNotEquals(getDateLine(newMail), getDateLine(fMail));
    assertEquals(getMessageIdLine(newMail), getMessageIdLine(fMail));
});

Deno.test("replaceMessageIdLine", () => {
    const fMail = makeFoldedMail();
    const lines = seml.getLines(fMail);
    const newLines = seml.replaceMessageIdLine(lines);
    assertNotEquals(newLines, lines);

    const newMail = seml.concatBytes(newLines);
    assertNotEquals(newMail, fMail);
    assertNotEquals(getMessageIdLine(newMail), getMessageIdLine(fMail));
    assertEquals(getDateLine(newMail), getDateLine(fMail));
});

Deno.test("replaceMail", () => {
    const mail = makeSimpleMail();
    const rMailNo = seml.replaceMail(mail, false, false);
    assertEquals(rMailNo.res!!, mail);

    const rMail = seml.replaceMail(mail, true, true);
    assertNotEquals(rMail, mail);
    assertEquals(rMail.res!!.slice(rMail.res!!.length - 100), mail.slice(mail.length - 100));

    const invalidMail = makeInvalidMail();
    assertFalse(seml.replaceMail(invalidMail, true, true).ok);
});

Deno.test("getAndMapSettings", () => {
    const settings = seml.mapSettings(seml.getSettingsFromText(seml.makeJsonSample()).json!);
    assertEquals(settings.smtpHost, "172.16.3.151");
    assertEquals(settings.smtpPort, 25);
    assertEquals(settings.fromAddress, "a001@ah62.example.jp");
    assertEquals(settings.toAddresses, ["a001@ah62.example.jp", "a002@ah62.example.jp", "a003@ah62.example.jp"]);
    assertEquals(settings.emlFiles, ["test1.eml", "test2.eml", "test3.eml"])
    assertTrue(settings.updateDate);
    assertTrue(settings.updateMessageId);
    assertFalse(settings.useParallel);
});

Deno.test("checkSettings", () => {
    const f = (key: string) => {
        const json = seml.makeJsonSample();
        const noKey = json.replace(key, `X-${key}`);
        return seml.checkSettings(seml.getSettingsFromText(noKey).json!)
    };

    assertTrue(f("updateDate").ok);
    assertTrue(f("updateMessageId").ok);
    assertTrue(f("useParallel").ok);

    assertFalse(f("smtpHost").ok);
    assertFalse(f("smtpPort").ok);
    assertFalse(f("fromAddress").ok);
    assertFalse(f("toAddresses").ok);
    assertFalse(f("emlFiles").ok);
});

Deno.test("replaceCrlfDot", () => {
    const f = seml.replaceCrlfDot;

    assertEquals(f("TEST"), "TEST");
    assertEquals(f("CRLF"), "CRLF");
    assertEquals(f(seml.CRLF), seml.CRLF);
    assertEquals(f("."), ".");
    assertEquals(f(`${seml.CRLF}.`), "<CRLF>.");
});

Deno.test("isLastReply", () => {
    const f = seml.isLastReply;

    assertFalse(f("250-First line"));
    assertFalse(f("250-Second line"));
    assertFalse(f("250-234 Text beginning with numbers"));
    assertTrue(f("250 The last line"));
});

Deno.test("isPositiveReply", () => {
    const f = seml.isPositiveReply;

    assertTrue(f("200 xxx"));
    assertTrue(f("300 xxx"));

    assertFalse(f("400 xxx"));
    assertFalse(f("500 xxx"));
    assertFalse(f("xxx 200"));
    assertFalse(f("xxx 300"));
});

function makeTestSendCmd(expected: string): seml.SendCmd {
    return async (cmd: string) => {
        assertEquals(cmd, expected);
        return {ok: true, msg: cmd}
    }
}

Deno.test("sendHello", () => {
    seml.sendHello(makeTestSendCmd("EHLO localhost"));
});

Deno.test("sendFrom", () => {
    seml.sendFrom(makeTestSendCmd("MAIL FROM: <a001@ah62.example.jp>"), "a001@ah62.example.jp");
});

Deno.test("sendRcptTo", () => {
    let count = 1;
    const test = async (cmd: string) => {
        assertEquals(`RCPT TO: <a00${count}@ah62.example.jp>`, cmd);
        count += 1;
        return {ok: true, msg: cmd};
    };

    seml.sendRcptTo(test, ["a001@ah62.example.jp", "a002@ah62.example.jp", "a003@ah62.example.jp"]);
});

Deno.test("sendData", () => {
    seml.sendData(makeTestSendCmd("DATA"));
});

Deno.test("sendCrlfDot", () => {
    seml.sendCrlfDot(makeTestSendCmd("\r\n."));
});

Deno.test("sendQuit", () => {
    seml.sendQuit(makeTestSendCmd("QUIT"));
});

Deno.test("sendRset", () => {
    seml.sendRset(makeTestSendCmd("RSET"));
});

Deno.test("checkJsonValue", () => {
    function f(jsonStr: string, type: string): seml.ErrorResult {
        return seml.checkJsonValue(JSON.parse(jsonStr), "test", type);
    }

    function checkError(jsonStr: string, type: string, expected: string) {
        const res = f(jsonStr, type);
        assertFalse(res.ok);
        assertEquals(res.msg!, expected);
    }

    const jsonStr = `{"test": "172.16.3.151"}`;
    assertTrue(f(jsonStr, "string").ok);
    assertFalse(f(jsonStr, "number").ok);
    checkError(jsonStr, "boolean", "test: Invalid type: 172.16.3.151");

    const jsonNumber = `{"test": 172}`;
    assertTrue(f(jsonNumber, "number").ok);
    assertFalse(f(jsonNumber, "string").ok);
    checkError(jsonNumber, "boolean", "test: Invalid type: 172");

    const jsonTrue = `{"test": true}`;
    assertTrue(f(jsonTrue, "boolean").ok);
    assertFalse(f(jsonTrue, "string").ok);
    checkError(jsonTrue, "number", "test: Invalid type: true");

    const jsonFalse = `{"test": false}`;
    assertTrue(f(jsonFalse, "boolean").ok);
    assertFalse(f(jsonFalse, "string").ok);
    checkError(jsonFalse, "number", "test: Invalid type: false");
});

Deno.test("checkJsonArrayValue", () => {
    function f(jsonStr: string, type: string): seml.ErrorResult {
        return seml.checkJsonArrayValue(JSON.parse(jsonStr), "test", type);
    }

    function checkError(jsonStr: string, type: string, expected: string) {
        const res = f(jsonStr, type);
        assertFalse(res.ok);
        assertEquals(res.msg!, expected);
    }

    const jsonArray = `{"test": ["172.16.3.151", "172.16.3.152", "172.16.3.153"]}`;
    assertTrue(f(jsonArray, "string").ok);

    const jsonStr = `{"test": "172.16.3.151"}`;
    checkError(jsonStr, "string", "test: Invalid type (array): 172.16.3.151");

    const jsonInvalidArray = `{"test": ["172.16.3.151", "172.16.3.152", 172]}`;
    checkError(jsonInvalidArray, "string", "test: Invalid type (element): 172");
});