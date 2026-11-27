using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace SpriteBuddy
{
    /// <summary>
    /// A small JSON reader, so the runtime needs no JSON package. Objects come back as
    /// <c>Dictionary&lt;string, object&gt;</c>, lists as <c>List&lt;object&gt;</c>, numbers as
    /// <c>double</c>, and strings, booleans and null as themselves.
    /// </summary>
    public static class Json
    {
        /// <summary>Parses JSON text. Throws <see cref="FormatException"/> saying where it's wrong.</summary>
        public static object Parse(string text)
        {
            if (text == null) throw new FormatException("not valid JSON: no text");
            var reader = new Reader(text);
            reader.SkipSpace();
            var value = reader.Value();
            reader.SkipSpace();
            if (!reader.AtEnd) throw reader.Error("unexpected text after the end");
            return value;
        }

        sealed class Reader
        {
            readonly string _text;
            int _at;

            public Reader(string text)
            {
                _text = text;
                // A UTF-8 byte order mark is allowed before the JSON.
                if (_text.Length > 0 && _text[0] == '﻿') _at = 1;
            }

            public bool AtEnd => _at >= _text.Length;

            public FormatException Error(string message)
            {
                var line = 1;
                for (var i = 0; i < _at && i < _text.Length; i++)
                    if (_text[i] == '\n') line++;
                return new FormatException("not valid JSON (line " + line + "): " + message);
            }

            public void SkipSpace()
            {
                while (!AtEnd)
                {
                    var c = _text[_at];
                    if (c == ' ' || c == '\t' || c == '\n' || c == '\r') _at++;
                    else break;
                }
            }

            public object Value()
            {
                if (AtEnd) throw Error("unexpected end");
                var c = _text[_at];
                switch (c)
                {
                    case '{': return Object();
                    case '[': return List();
                    case '"': return String();
                    case 't': Word("true"); return true;
                    case 'f': Word("false"); return false;
                    case 'n': Word("null"); return null;
                    default:
                        if (c == '-' || (c >= '0' && c <= '9')) return Number();
                        throw Error("unexpected '" + c + "'");
                }
            }

            void Word(string word)
            {
                if (string.CompareOrdinal(_text, _at, word, 0, word.Length) != 0) throw Error("expected " + word);
                _at += word.Length;
            }

            Dictionary<string, object> Object()
            {
                var result = new Dictionary<string, object>();
                _at++;
                SkipSpace();
                if (!AtEnd && _text[_at] == '}')
                {
                    _at++;
                    return result;
                }
                while (true)
                {
                    SkipSpace();
                    if (AtEnd || _text[_at] != '"') throw Error("expected a key in quotes");
                    var key = String();
                    SkipSpace();
                    if (AtEnd || _text[_at] != ':') throw Error("expected ':'");
                    _at++;
                    SkipSpace();
                    result[key] = Value();
                    SkipSpace();
                    if (AtEnd) throw Error("unexpected end");
                    if (_text[_at] == ',') { _at++; continue; }
                    if (_text[_at] == '}') { _at++; return result; }
                    throw Error("expected ',' or '}'");
                }
            }

            List<object> List()
            {
                var result = new List<object>();
                _at++;
                SkipSpace();
                if (!AtEnd && _text[_at] == ']')
                {
                    _at++;
                    return result;
                }
                while (true)
                {
                    SkipSpace();
                    result.Add(Value());
                    SkipSpace();
                    if (AtEnd) throw Error("unexpected end");
                    if (_text[_at] == ',') { _at++; continue; }
                    if (_text[_at] == ']') { _at++; return result; }
                    throw Error("expected ',' or ']'");
                }
            }

            string String()
            {
                _at++;
                var text = new StringBuilder();
                while (true)
                {
                    if (AtEnd) throw Error("unfinished string");
                    var c = _text[_at++];
                    if (c == '"') return text.ToString();
                    if (c < ' ') throw Error("control character in a string");
                    if (c != '\\')
                    {
                        text.Append(c);
                        continue;
                    }
                    if (AtEnd) throw Error("unfinished string");
                    var e = _text[_at++];
                    switch (e)
                    {
                        case '"': text.Append('"'); break;
                        case '\\': text.Append('\\'); break;
                        case '/': text.Append('/'); break;
                        case 'b': text.Append('\b'); break;
                        case 'f': text.Append('\f'); break;
                        case 'n': text.Append('\n'); break;
                        case 'r': text.Append('\r'); break;
                        case 't': text.Append('\t'); break;
                        case 'u':
                            if (_at + 4 > _text.Length) throw Error("bad \\u escape");
                            if (!int.TryParse(_text.Substring(_at, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var code))
                                throw Error("bad \\u escape");
                            text.Append((char)code);
                            _at += 4;
                            break;
                        default:
                            throw Error("bad escape \\" + e);
                    }
                }
            }

            double Number()
            {
                var start = _at;
                if (_text[_at] == '-') _at++;
                Digits();
                if (!AtEnd && _text[_at] == '.')
                {
                    _at++;
                    Digits();
                }
                if (!AtEnd && (_text[_at] == 'e' || _text[_at] == 'E'))
                {
                    _at++;
                    if (!AtEnd && (_text[_at] == '+' || _text[_at] == '-')) _at++;
                    Digits();
                }
                var token = _text.Substring(start, _at - start);
                if (!double.TryParse(token, NumberStyles.Float, CultureInfo.InvariantCulture, out var value))
                    throw Error("bad number " + token);
                return value;
            }

            void Digits()
            {
                var start = _at;
                while (!AtEnd && _text[_at] >= '0' && _text[_at] <= '9') _at++;
                if (_at == start) throw Error("expected a digit");
            }
        }
    }
}
