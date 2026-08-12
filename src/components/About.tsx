import React from "react";
import { AtSign, Globe2, GraduationCap, Mail, Phone } from "lucide-react";

const Person = ({
  name,
  phone,
  email,
  image,
  twitter,
  website,
}: {
  name: string;
  phone: string;
  email: string;
  image: string;
  twitter: string;
  website?: string;
}) => (
  <article className="editorial-person">
    <div className="editorial-photo">
      <img src={image} alt="" />
    </div>
    <div className="editorial-person-copy">
      <span className="editorial-role">
        <GraduationCap /> أستاذ تكنولوجيا التعليم
      </span>
      <h2>{name}</h2>
      <p>قسم تكنولوجيا التعليم، كلية التربية الأساسية</p>
      <div className="editorial-contact">
        <a href={`tel:${phone.replace(/\s/g, "")}`}>
          <Phone />
          <span dir="ltr">{phone}</span>
        </a>
        <a href={`mailto:${email}`}>
          <Mail />
          <span>{email}</span>
        </a>
      </div>
      <div className="editorial-social">
        <a href={twitter} target="_blank" rel="noreferrer">
          <AtSign /> X / Twitter
        </a>
        {website ? (
          <a href={website} target="_blank" rel="noreferrer">
            <Globe2 /> الموقع الشخصي
          </a>
        ) : null}
      </div>
    </div>
  </article>
);

export default function About() {
  return (
    <div className="about-editorial">
      <header className="about-editorial-hero">
        <span>SCHEDULE · التحكم الأكاديمي</span>
        <h1>
          الجدول الدراسي،
          <br />
          كمنتج يُفهم من أول نظرة.
        </h1>
        <p>
          منظومة صُممت لمسؤولي إعداد الجداول الدراسية: بناء الجدول، مراجعته،
          البحث فيه وإخراج تقاريره داخل مساحة واحدة واضحة وهادئة.
        </p>
      </header>
      <section className="about-editorial-people">
        <Person
          name="د. أحمد حسين الفيلكاوي"
          phone="00965 97424400"
          email="Ah.Alfailakawi@paaet.edu.kw"
          image="/assets/about/A2.png"
          twitter="https://twitter.com/DrAhmadKw"
          website="http://dr-alfailakawi.com/"
        />
        <Person
          name="د. عبدالعزيز دخيل العنزي"
          phone="00965 55995095"
          email="dr.abdulazizalenizi@yahoo.com"
          image="/assets/about/A1.png"
          twitter="https://twitter.com/AbdulazizAleniz"
        />
      </section>
      <footer className="about-editorial-footer">
        <span>Schedule</span>
        <small>مساحة عمل الجدول الأكاديمي</small>
      </footer>
    </div>
  );
}
