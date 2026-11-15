import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, MessageCircle, Phone, Search } from "lucide-react";
import { adminApi } from "../api";
import { Empty, ErrorNote, inputClass, Loading, PageTitle, useLoad } from "../ui";
import { timeAgo } from "../../utils/format";

export default function Customers() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const { data, error, loading } = useLoad(() => adminApi.customers(debounced), [debounced]);

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="People"
        title="Customers"
        text="Everyone who has enquired, grouped by mobile number, with their enquiry history. Private: visible only to signed-in team members."
      />
      <label className="relative block max-w-md">
        <span className="sr-only">Search customers</span>
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5e6872]" aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone or email" className={`${inputClass} pl-10`} />
      </label>
      <ErrorNote error={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <Empty>No customers {debounced ? "match your search" : "yet"}.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e7e2d8] bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#fbfaf7] text-[11px] uppercase tracking-wide text-[#5e6872]">
              <tr>
                <th className="px-4 py-3 font-bold">Customer</th>
                <th className="px-4 py-3 font-bold">Contact</th>
                <th className="px-4 py-3 font-bold">Enquiries</th>
                <th className="px-4 py-3 font-bold">Interested in</th>
                <th className="px-4 py-3 font-bold">Latest status</th>
                <th className="px-4 py-3 font-bold">Last contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#efebe3]">
              {data.items.map((c) => (
                <tr key={c.phone} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#142536]">{c.name}</p>
                    <Link to={`/admin/leads?lead=${c.latest_reference}`} className="font-mono text-xs text-[#80602b] hover:underline">
                      {c.latest_reference}
                    </Link>
                  </td>
                  <td className="space-y-1 px-4 py-3">
                    <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-[#142536] hover:underline">
                      <Phone size={13} aria-hidden="true" /> {c.phone}
                    </a>
                    <a href={`https://api.whatsapp.com/send?phone=${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-emerald-700 hover:underline">
                      <MessageCircle size={13} aria-hidden="true" /> WhatsApp
                    </a>
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-[#263746] hover:underline">
                        <Mail size={13} aria-hidden="true" /> {c.email}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#263746]">
                    <strong className="text-[#142536]">{c.enquiries}</strong>
                    <span className="block text-xs text-[#5e6872]">{c.kinds.map((k) => k.replace("_", " ")).join(", ")}</span>
                  </td>
                  <td className="px-4 py-3 text-[#263746]">{c.properties.slice(0, 3).join("; ") || "–"}</td>
                  <td className="px-4 py-3 capitalize text-[#263746]">{c.latest_status.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-[#5e6872]">{timeAgo(c.last_contact)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <p className="text-xs text-[#5e6872]">{data.total} customers</p>}
    </div>
  );
}
