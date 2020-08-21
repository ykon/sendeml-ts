// Copyright (c) Yuki Ono.
// Licensed under the MIT License.

import {
    assert,
    assertEquals,
    assertNotEquals
} from "https://deno.land/std/testing/asserts.ts";

import * as eml from "./sendeml.ts";

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

Deno.test("matchHeaderField", () => {
    const test = (s1: string, s2: string): boolean =>
        eml.matchHeaderField(s1.toBytes(), s2.toBytes());

    assertEquals(test("Test:", "Test:"), true);
    assertEquals(test("Test: ", "Test:"), true);
    assertEquals(test("Test:x", "Test:"), true);

    assertEquals(test("", "Test:"), false);
    assertEquals(test("T", "Test:"), false);
    assertEquals(test("Test", "Test:"), false);
});

Deno.test("isDateLine", () => {
    const test = (s: string): boolean => eml.isDateLine(s.toBytes())

    assertEquals(test("Date: xxx"), true);
    assertEquals(test("Date:xxx"), true);
    assertEquals(test("Date:"), true);
    assertEquals(test("Date:   "), true);

    assertEquals(test(""), false);
    assertEquals(test("Date"), false);
    assertEquals(test("xxx: Date"), false);
    assertEquals(test("X-Date: xxx"), false);
});

Deno.test("isMessageIdLine", () => {
    const test = (s: string): boolean => eml.isMessageIdLine(s.toBytes())

    assertEquals(test("Message-ID: xxx"), true);
    assertEquals(test("Message-ID:xxx"), true);
    assertEquals(test("Message-ID:"), true);
    assertEquals(test("Message-ID:   "), true);

    assertEquals(test(""), false);
    assertEquals(test("Message-ID"), false);
    assertEquals(test("xxx: Message-ID"), false);
    assertEquals(test("X-Message-ID: xxx"), false);
});
  
Deno.test("isNotUpdate", () => {;
    assertEquals(eml.isNotUpdate(true, true), false);
    assertEquals(eml.isNotUpdate(true, false), false);
    assertEquals(eml.isNotUpdate(false, true), false);
    assertEquals(eml.isNotUpdate(false, false), true);
});

Deno.test("makeDateLine", () => {
    const line = eml.makeNowDateLine();
    assert(line.startsWith("Date:"));
    assert(line.endsWith(eml.CRLF));
    assert(line.length <= 80);
});

Deno.test("makeRandomMessageIdLine", () => {
    const line = eml.makeRandomMessageIdLine();
    assert(line.startsWith("Message-ID:"));
    assert(line.endsWith(eml.CRLF));
    assert(line.length <= 80);
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

Deno.test("findCrIndex", () => {
    const mail = makeSimpleMail();
    assertEquals(eml.findCrIndex(mail, 0), 33);
    assertEquals(eml.findCrIndex(mail, 34), 48);
    assertEquals(eml.findCrIndex(mail, 58), 74);
});

Deno.test("findLfIndex", () => {
    const mail = makeSimpleMail();
    assertEquals(eml.findLfIndex(mail, 0), 34);
    assertEquals(eml.findLfIndex(mail, 35), 49);
    assertEquals(eml.findLfIndex(mail, 59), 75);
});

Deno.test("findAllLfIndices", () => {
    const mail = makeSimpleMail();
    const indices = eml.findAllLfIndices(mail);

    assertEquals(indices[0], 34);
    assertEquals(indices[1], 49);
    assertEquals(indices[2], 75);

    assertEquals(indices[indices.length - 3], 390);
    assertEquals(indices[indices.length - 2], 415);
    assertEquals(indices[indices.length - 1], 417);
});

Deno.test("getRawLines", () => {
    const mail = makeSimpleMail();
    const lines = eml.getRawLines(mail);

    assertEquals(lines.length, 13);
    assertEquals(lines[0].toUtf8String(), "From: a001 <a001@ah62.example.jp>\r\n");
    assertEquals(lines[1].toUtf8String(), "Subject: test\r\n");
    assertEquals(lines[2].toUtf8String(), "To: a002@ah62.example.jp\r\n");

    assertEquals(lines[lines.length - 3].toUtf8String(), "Content-Language: en-US\r\n");
    assertEquals(lines[lines.length - 2].toUtf8String(), "\r\n");
    assertEquals(lines[lines.length - 1].toUtf8String(), "test");
});

Deno.test("isWsp", () => {
    assertEquals(eml.isWsp(" ".charCodeAt(0)), true);
    assertEquals(eml.isWsp("\t".charCodeAt(0)), true);
    assertEquals(eml.isWsp("\0".charCodeAt(0)), false);
    assertEquals(eml.isWsp("a".charCodeAt(0)), false);
    assertEquals(eml.isWsp("b".charCodeAt(0)), false);
});

Deno.test("isFoldedLine", () => {
    const test = (...ss: string[]): boolean =>
        eml.isFoldedLine(Uint8Array.from(ss.map(s => s.charCodeAt(0))))

    assertEquals(test(" ", "a", "b"), true);
    assertEquals(test("\t", "a", "b"), true);
    assertEquals(test("\0", "a", "b"), false);
    assertEquals(test("a", "a", " "), false);
    assertEquals(test("b", "a", "\t"), false);
});

Deno.test("concatBytes", () => {
    const mail = makeSimpleMail();
    const lines = eml.getRawLines(mail);
    const newMail = eml.concatBytes(lines);
    assertEquals(newMail, mail);
});

Deno.test("replaceHeader", () => {
    const mail = makeSimpleMail();
    const dateLine = getDateLine(mail);
    const midLine = getMessageIdLine(mail);

    const rHeaderNo = eml.replaceHeader(mail, false, false);
    assertEquals(rHeaderNo, mail);

    const rHeader = eml.replaceHeader(mail, true, true);
    assertNotEquals(rHeader, mail);

    const replace = (header: Uint8Array, updateDate: boolean, updateMessageId: boolean): [string, string] => {
        const rHeader = eml.replaceHeader(header, updateDate, updateMessageId);
        assertNotEquals(rHeader, header);
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

Deno.test("findEmptyLine", () => {
    const mail = makeSimpleMail();
    assertEquals(eml.findEmptyLine(mail), 414);

    const invalidMail = makeInvalidMail();
    assertEquals(eml.findEmptyLine(invalidMail), -1);
});

Deno.test("splitMail", () => {
    const mail = makeSimpleMail();
    const headerBody = eml.splitMail(mail);
    assertEquals(headerBody.ok, true);

    const [header, body] = headerBody.res!;
    assertEquals(header, mail.slice(0, 414));
    assertEquals(body, mail.slice(414 + 4));

    const invalidMail = makeInvalidMail();
    assertEquals(eml.splitMail(invalidMail).ok, false);
});

Deno.test("combineMail", () => {
    const mail = makeSimpleMail();
    const [header, body] = eml.splitMail(mail).res!;
    const newMail = eml.combineMail(header, body);
    assertEquals(newMail, mail);
});

Deno.test("replaceMail", () => {
    const mail = makeSimpleMail();
    const rMailNo = eml.replaceMail(mail, false, false);
    assertEquals(rMailNo, mail);

    const rMail = eml.replaceMail(mail, true, true);
    assertNotEquals(rMail, mail);
    assertEquals(rMail.slice(rMail.length - 100), mail.slice(mail.length - 100));

    const invalidMail = makeInvalidMail();
    assertEquals(eml.replaceMail(invalidMail, true, true), invalidMail);
});

Deno.test("getAndMapSettings", () => {
    const settings = eml.mapSettings(eml.getSettingsFromText(eml.makeJsonSample()).json!);
    assertEquals(settings.smtpHost, "172.16.3.151");
    assertEquals(settings.smtpPort, 25);
    assertEquals(settings.fromAddress, "a001@ah62.example.jp");
    assertEquals(settings.toAddresses, ["a001@ah62.example.jp", "a002@ah62.example.jp", "a003@ah62.example.jp"]);
    assertEquals(settings.emlFiles, ["test1.eml", "test2.eml", "test3.eml"])
    assertEquals(settings.updateDate, true);
    assertEquals(settings.updateMessageId, true);
    assertEquals(settings.useParallel, false);
});

Deno.test("checkSettings", () => {
    const checkNoKey = (key: string) => {
        const json = eml.makeJsonSample();
        const noKey = json.replace(key, `X-${key}`);
        return eml.checkSettings(eml.getSettingsFromText(noKey).json!)
    };

    assertEquals(checkNoKey("smtpHost").ok, false);
    assertEquals(checkNoKey("smtpPort").ok, false);
    assertEquals(checkNoKey("fromAddress").ok, false);
    assertEquals(checkNoKey("toAddresses").ok, false);
    assertEquals(checkNoKey("emlFiles").ok, false);

    assertEquals(checkNoKey("updateDate").ok, true);
    assertEquals(checkNoKey("updateMessageId").ok, true);
    assertEquals(checkNoKey("useParallel").ok, true);
});

Deno.test("replaceCrlfDot", () => {
    assertEquals(eml.replaceCrlfDot("TEST"), "TEST");
    assertEquals(eml.replaceCrlfDot("CRLF"), "CRLF");
    assertEquals(eml.replaceCrlfDot(eml.CRLF), eml.CRLF);
    assertEquals(eml.replaceCrlfDot("."), ".");
    assertEquals(eml.replaceCrlfDot(`${eml.CRLF}.`), "<CRLF>.");
});

Deno.test("isLastReply", () => {
    assertEquals(eml.isLastReply("250-First line"), false);
    assertEquals(eml.isLastReply("250-Second line"), false);
    assertEquals(eml.isLastReply("250-234 Text beginning with numbers"), false);
    assertEquals(eml.isLastReply("250 The last line"), true);
});

Deno.test("isPositiveReply", () => {
    assertEquals(eml.isPositiveReply("200 xxx"), true);
    assertEquals(eml.isPositiveReply("300 xxx"), true);
    assertEquals(eml.isPositiveReply("400 xxx"), false);
    assertEquals(eml.isPositiveReply("500 xxx"), false);
    assertEquals(eml.isPositiveReply("xxx 200"), false);
    assertEquals(eml.isPositiveReply("xxx 300"), false);
});

function makeTestSendCmd(expected: string): eml.SendCmd {
    return async (cmd: string) => {
        assertEquals(cmd, expected);
        return {ok: true, msg: cmd}
    }
}

Deno.test("sendHello", () => {
    eml.sendHello(makeTestSendCmd("EHLO localhost"));
});

Deno.test("sendFrom", () => {
    eml.sendFrom(makeTestSendCmd("MAIL FROM: <a001@ah62.example.jp>"), "a001@ah62.example.jp");
});

Deno.test("sendRcptTo", () => {
    let count = 1;
    const test = async (cmd: string) => {
        assertEquals(`RCPT TO: <a00${count}@ah62.example.jp>`, cmd);
        count += 1;
        return {ok: true, msg: cmd};
    };

    eml.sendRcptTo(test, ["a001@ah62.example.jp", "a002@ah62.example.jp", "a003@ah62.example.jp"]);
});

Deno.test("sendData", () => {
    eml.sendData(makeTestSendCmd("DATA"));
});

Deno.test("sendCrlfDot", () => {
    eml.sendCrlfDot(makeTestSendCmd("\r\n."));
});

Deno.test("sendQuit", () => {
    eml.sendQuit(makeTestSendCmd("QUIT"));
});

Deno.test("sendRset", () => {
    eml.sendRset(makeTestSendCmd("RSET"));
});

Deno.test("checkJsonValue", () => {
    function check(jsonStr: string, type: string): eml.ErrorResult {
        return eml.checkJsonValue(JSON.parse(jsonStr), "test", type);
    }

    function checkError(jsonStr: string, type: string, expected: string) {
        const res = check(jsonStr, type);
        assertEquals(res.ok, false);
        assertEquals(res.msg!, expected);
    }

    const jsonStr = `{"test": "172.16.3.151"}`;
    assertEquals(check(jsonStr, "string").ok, true);
    assertEquals(check(jsonStr, "number").ok, false);
    checkError(jsonStr, "boolean", "test: Invalid type: 172.16.3.151");

    const jsonNumber = `{"test": 172}`;
    assertEquals(check(jsonNumber, "number").ok, true);
    assertEquals(check(jsonNumber, "string").ok, false);
    checkError(jsonNumber, "boolean", "test: Invalid type: 172");

    const jsonTrue = `{"test": true}`;
    assertEquals(check(jsonTrue, "boolean").ok, true);
    assertEquals(check(jsonTrue, "string").ok, false);
    checkError(jsonTrue, "number", "test: Invalid type: true");

    const jsonFalse = `{"test": false}`;
    assertEquals(check(jsonFalse, "boolean").ok, true);
    assertEquals(check(jsonFalse, "string").ok, false);
    checkError(jsonFalse, "number", "test: Invalid type: false");
});

Deno.test("checkJsonArrayValue", () => {
    function check(jsonStr: string, type: string): eml.ErrorResult {
        return eml.checkJsonArrayValue(JSON.parse(jsonStr), "test", type);
    }

    function checkError(jsonStr: string, type: string, expected: string) {
        const res = check(jsonStr, type);
        assertEquals(res.ok, false);
        assertEquals(res.msg!, expected);
    }

    const jsonArray = `{"test": ["172.16.3.151", "172.16.3.152", "172.16.3.153"]}`;
    assertEquals(check(jsonArray, "string").ok, true);

    const jsonStr = `{"test": "172.16.3.151"}`;
    checkError(jsonStr, "string", "test: Invalid type (array): 172.16.3.151");

    const jsonInvalidArray = `{"test": ["172.16.3.151", "172.16.3.152", 172]}`;
    checkError(jsonInvalidArray, "string", "test: Invalid type (element): 172");
});