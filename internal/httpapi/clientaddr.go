package httpapi

import (
	"errors"
	"net/http"
	"net/netip"
	"strings"
)

// clientKey identifies the client for throttling. The connecting address is used unless it is a
// trusted proxy; then the right-most X-Forwarded-For address that is not itself a trusted proxy is
// used, because each trusted proxy appends the address it received the request from and anything
// further left may be forged by the client. IPv6 clients are grouped by /64.
func clientKey(r *http.Request, trusted []netip.Prefix) string {
	remote, ok := parseAddr(r.RemoteAddr)
	if !ok {
		return "unparsed"
	}
	client := remote
	if isTrusted(remote, trusted) {
		hops := strings.Split(strings.Join(r.Header.Values("X-Forwarded-For"), ","), ",")
		for i := len(hops) - 1; i >= 0; i-- {
			hop, ok := parseAddr(strings.TrimSpace(hops[i]))
			if !ok {
				break
			}
			client = hop
			if !isTrusted(hop, trusted) {
				break
			}
		}
	}
	if client.Is6() {
		p, _ := client.Prefix(64)
		return p.String()
	}
	return client.String()
}

func isTrusted(a netip.Addr, trusted []netip.Prefix) bool {
	for _, p := range trusted {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

func parseAddr(s string) (netip.Addr, bool) {
	if ap, e := netip.ParseAddrPort(s); e == nil {
		return ap.Addr().Unmap(), true
	}
	a, e := netip.ParseAddr(strings.Trim(s, "[]"))
	if e != nil {
		return netip.Addr{}, false
	}
	return a.WithZone("").Unmap(), true
}

// ParseTrustedProxies reads a comma-separated list of CIDR ranges or single addresses, such as the
// TRUSTED_PROXY_CIDRS environment variable. An empty string trusts no proxy.
func ParseTrustedProxies(list string) ([]netip.Prefix, error) {
	out := []netip.Prefix{}
	if strings.TrimSpace(list) == "" {
		return out, nil
	}
	for _, item := range strings.Split(list, ",") {
		item = strings.TrimSpace(item)
		if p, e := netip.ParsePrefix(item); e == nil {
			out = append(out, p.Masked())
			continue
		}
		a, e := netip.ParseAddr(item)
		if e != nil || a.Zone() != "" {
			return nil, errors.New("trusted proxies must be comma-separated IP addresses or CIDR ranges")
		}
		out = append(out, netip.PrefixFrom(a.Unmap(), a.Unmap().BitLen()))
	}
	return out, nil
}
